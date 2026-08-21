"use server";

import { createDocument, updateDocument } from "@/lib/data/documents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const status = text(formData, "status");
  if (!name || !type || !status) return null;

  const customLabels = formData.getAll("customLabel");
  const customValues = formData.getAll("customValue");
  const customFields = customLabels.flatMap((label, index) => {
    if (typeof label !== "string" || !label.trim()) return [];
    const value = customValues[index];
    return [{ label: label.trim(), value: typeof value === "string" ? value.trim() : "" }];
  });

  return {
    name,
    type,
    status,
    expiryDate: date(formData, "expiryDate"),
    issueDate: date(formData, "issueDate"),
    documentNumber: text(formData, "documentNumber") || null,
    country: text(formData, "country") || null,
    notes: text(formData, "notes") || null,
    expiryDateLabel: text(formData, "expiryDateLabel") || "Expiry date",
    issueDateLabel: text(formData, "issueDateLabel") || "Issue date",
    documentNumberLabel: text(formData, "documentNumberLabel") || "Document number",
    countryLabel: text(formData, "countryLabel") || "Country",
    notesLabel: text(formData, "notesLabel") || "Notes",
    customFields,
  };
}

export async function createDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const data = documentData(formData);
  if (!data) return { error: "Name, type, and status are required." };
  const document = await createDocument(data);
  redirect(`/documents/${document.id}`);
}

export async function updateDocumentAction(
  documentId: string,
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const data = documentData(formData);
  if (!data) return { error: "Name, type, and status are required." };
  await updateDocument(documentId, data);
  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  return {};
}
