"use server";

import { createDocument, deleteUnusedDocumentType, resolveDocumentType, updateDocument, type DocumentInput } from "@/lib/data/documents";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocumentState, REMINDER_OPTIONS } from "@/lib/documents/expiry";
import { addActivity } from "@/lib/data/activity";
import { parseDateOnly } from "@/lib/dates";
import { CUSTOM_FIELD_TYPES, type CustomFieldType, type CustomFieldValue } from "@/lib/custom-fields/types";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";
import { refusalOf } from "@/lib/actions/refusal";
import { getToday } from "@/lib/format/server";
import { completeCaptureConversion } from "@/lib/data/capture";

export type DocumentActionState = { error?: string; success?: boolean };
export type CreateDocumentState = DocumentActionState;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads a date-only field, or says what is wrong with it.
 *
 * `parseDateOnly` is the one place "yyyy-mm-dd string -> UTC calendar date"
 * happens, so an out-of-range day like 2026-02-30 is rejected here rather
 * than silently rolling into March -- the same defect already fixed once for
 * custom items and once for finance, closed here for documents too.
 */
type DateFieldResult = { ok: true; value: Date | null } | { ok: false; error: string };

function dateField(formData: FormData, name: string, label: string): DateFieldResult {
  const value = text(formData, name);
  if (!value) return { ok: true, value: null };
  const parsed = parseDateOnly(value);
  if (!parsed) return { ok: false, error: `Enter a valid ${label}.` };
  return { ok: true, value: parsed };
}

/**
 * Reads the form, or says what is wrong with it.
 *
 * Every problem here is one the person can fix, so it comes back as a message
 * the form renders. The Kinesis Link check used to `throw` its sentence, which
 * Next.js redacts on the way to the browser: the owner got "An unexpected error
 * occurred" and a digest hash instead of being told which field to fill in.
 */
type DocumentFormResult = { ok: true; data: DocumentInput } | { ok: false; error: string };

function documentData(formData: FormData, today: Date): DocumentFormResult {
  const name = text(formData, "name");
  const type = text(formData, "type");
  if (!name || !type) return { ok: false, error: "Name and type are required." };
  const expiryField = dateField(formData, "expiryDate", "expiry date");
  if (!expiryField.ok) return expiryField;
  const issueField = dateField(formData, "issueDate", "issue date");
  if (!issueField.ok) return issueField;
  const expiryDate = expiryField.value;
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
  const customFields: CustomFieldValue[] = [];
  for (const [index, label] of customLabels.entries()) {
    if (typeof label !== "string" || !label.trim()) continue;
    const value = customValues[index];
    const requestedType = String(customTypes[index] ?? "TEXT") as CustomFieldType;
    const fieldType = validTypes.has(requestedType) ? requestedType : "TEXT";
    const targetObjectId = fieldType === "KINESIS_LINK" ? String(customTargets[index] ?? "").trim() : "";
    if (fieldType === "KINESIS_LINK" && !targetObjectId) return { ok: false, error: `Choose what “${label.trim()}” links to.` };
    customFields.push({ id: String(customIds[index] ?? "") || undefined, label: label.trim(), value: fieldType === "KINESIS_LINK" ? "" : typeof value === "string" ? value.trim() : "", type: fieldType, targetObjectId: targetObjectId || null });
  }

  return { ok: true, data: {
    name,
    type,
    status: getDocumentState({ expiryDate, prompt, archived }, today).status,
    expiryDate,
    issueDate: issueField.value,
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
  } };
}

export async function createDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  // Narrowed through the result rather than destructured: a union loses its
  // correlation the moment its members are pulled apart.
  const form = documentData(formData, await getToday());
  if (!form.ok) return { error: form.error };
  const data = form.data;
  data.type = await resolveDocumentType(data.type);
  const unowned = await validateKinesisTargets(data.customFields ?? []);
  if (unowned) return { error: unowned };
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
  // Narrowed through the result rather than destructured: a union loses its
  // correlation the moment its members are pulled apart.
  const form = documentData(formData, await getToday());
  if (!form.ok) return { error: form.error };
  const data = form.data;
  data.type = await resolveDocumentType(data.type);
  const unowned = await validateKinesisTargets(data.customFields ?? []);
  if (unowned) return { error: unowned };
  try {
    await updateDocument(documentId, data);
  } catch (failure) {
    // A refusal raised inside the transaction, which has now rolled back.
    // Anything else is a fault, or one of Next.js's control-flow errors, and
    // belongs to the boundary rather than to this form.
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  await addActivity({ action: "Updated", moduleName: "Documents", objectName: data.name, icon: "documents", href: `/documents/${documentId}` });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteDocumentTypeAction(name: string): Promise<DocumentActionState> {
  const result = await deleteUnusedDocumentType(name);
  revalidatePath("/documents");
  return result;
}
