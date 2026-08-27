"use server";

import { createDocument, deleteUnusedDocumentType, resolveDocumentType, updateDocument } from "@/lib/data/documents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExpiryDetails, REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { addActivity } from "@/lib/data/activity";
import { parseKinesisTarget, CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields/types";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";

export type DocumentActionState = { error?: string };
export type CreateDocumentState = DocumentActionState;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function date(formData: FormData, name: string) {
  const value = text(formData, name);
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function documentData(formData: FormData) {
  const name = text(formData, "name");
  const type = text(formData, "type");
  if (!name || !type) return null;
  const expiryDate = date(formData, "expiryDate");
  const requestedPrompt = Number(text(formData, "prompt"));
  const prompt = REMINDER_OPTIONS.some((option) => option.days === requestedPrompt) ? requestedPrompt : 180;

  const customLabels = formData.getAll("customLabel");
  const customIds = formData.getAll("customId");
  const customValues = formData.getAll("customValue");
  const customTypes = formData.getAll("customType");
  const customTargets = formData.getAll("customTarget");
  const validTypes = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));
  const customFields = customLabels.flatMap((label, index) => {
    if (typeof label !== "string" || !label.trim()) return [];
    const value = customValues[index];
    const requestedType = String(customTypes[index] ?? "TEXT") as CustomFieldType;
    const type = validTypes.has(requestedType) ? requestedType : "TEXT";
    const target = type === "KINESIS_LINK" ? parseKinesisTarget(String(customTargets[index] ?? "")) : null;
    if (type === "KINESIS_LINK" && !target) throw new Error("Select an object for every Kinesis Link field");
    return [{ id: String(customIds[index] ?? "") || undefined, label: label.trim(), value: type === "KINESIS_LINK" ? "" : typeof value === "string" ? value.trim() : "", type, targetType: target?.targetType ?? null, targetId: target?.targetId ?? null }];
  });

  return {
    name,
    type,
    status: getExpiryDetails(expiryDate, prompt).status,
    expiryDate,
    issueDate: date(formData, "issueDate"),
    documentNumber: text(formData, "documentNumber") || null,
    country: text(formData, "country") || null,
    notes: text(formData, "notes") || null,
    link: text(formData, "link") || null,
    prompt,
    expiryDateLabel: text(formData, "expiryDateLabel") || "Expiry date",
    issueDateLabel: text(formData, "issueDateLabel") || "Issue date",
    documentNumberLabel: text(formData, "documentNumberLabel") || "Document number",
    countryLabel: text(formData, "countryLabel") || "Country",
    notesLabel: text(formData, "notesLabel") || "Notes",
    linkLabel: text(formData, "linkLabel") || "Link",
    customFields,
  };
}

export async function createDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const data = documentData(formData);
  if (!data) return { error: "Name and type are required." };
  data.type = await resolveDocumentType(data.type);
  await validateKinesisTargets(data.customFields);
  const document = await createDocument(data);
  await addActivity({ action: "Added", moduleName: "Documents", objectName: document.name, icon: "documents", href: `/documents/${document.id}` });
  revalidatePath("/", "layout");
  redirect(`/documents/${document.id}`);
}

export async function updateDocumentAction(
  documentId: string,
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const data = documentData(formData);
  if (!data) return { error: "Name and type are required." };
  data.type = await resolveDocumentType(data.type);
  await validateKinesisTargets(data.customFields);
  await updateDocument(documentId, data);
  await addActivity({ action: "Updated", moduleName: "Documents", objectName: data.name, icon: "documents", href: `/documents/${documentId}` });
  revalidatePath("/", "layout");
  return {};
}

export async function deleteDocumentTypeAction(name: string): Promise<DocumentActionState> {
  const result = await deleteUnusedDocumentType(name);
  revalidatePath("/documents");
  return result;
}
