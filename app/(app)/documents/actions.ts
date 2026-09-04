"use server";

import { createDocument, deleteUnusedDocumentType, resolveDocumentType, updateDocument } from "@/lib/data/documents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocumentState, REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { addActivity } from "@/lib/data/activity";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields/types";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";
import { completeCaptureConversion } from "@/lib/data/capture";

export type DocumentActionState = { error?: string; success?: boolean };
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
  // Absent on the create form, so a new document is never born archived.
  const archived = formData.get("archived") === "true";

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
    const targetObjectId = type === "KINESIS_LINK" ? String(customTargets[index] ?? "").trim() : "";
    if (type === "KINESIS_LINK" && !targetObjectId) throw new Error("Select an object for every Kinesis Link field");
    return [{ id: String(customIds[index] ?? "") || undefined, label: label.trim(), value: type === "KINESIS_LINK" ? "" : typeof value === "string" ? value.trim() : "", type, targetObjectId: targetObjectId || null }];
  });

  return {
    name,
    type,
    status: getDocumentState({ expiryDate, prompt, archived }).status,
    expiryDate,
    issueDate: date(formData, "issueDate"),
    documentNumber: text(formData, "documentNumber") || null,
    country: text(formData, "country") || null,
    notes: text(formData, "notes") || null,
    link: text(formData, "link") || null,
    prompt,
    archived,
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
  // No-op unless quick capture sent the user here to turn a To-Do into this
  // document, in which case the To-Do retires now that the richer record exists.
  await completeCaptureConversion(formData, { moduleName: "Documents", objectName: document.name, icon: "documents", href: `/documents/${document.id}` });
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
  return { success: true };
}

export async function deleteDocumentTypeAction(name: string): Promise<DocumentActionState> {
  const result = await deleteUnusedDocumentType(name);
  revalidatePath("/documents");
  return result;
}
