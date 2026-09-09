import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields/types";

export const TEMPLATE_FIELDS_FORM_KEY = "templateFieldsPayload";
export const TEMPLATE_FIELD_VALUES_FORM_KEY = "templateFieldValuesPayload";

export type TemplateFieldInput = { id?: string; label: string; type: CustomFieldType };
export type ParsedTemplateFields = { ok: true; fields: TemplateFieldInput[] } | { ok: false; error: string };

export type TemplateFieldValueInput = { templateFieldId: string; value: string; targetObjectIds: string[] };
export type ParsedTemplateFieldValues = { ok: true; values: TemplateFieldValueInput[] } | { ok: false; error: string };

const VALID_TYPES = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));

type Unknown = Record<string, unknown>;
const isRecord = (value: unknown): value is Unknown => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" ? value : "";
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Reads a template's field-definitions editor's JSON payload, the same
 * one-key-per-form shape `parseCustomFields` reads for field *values*
 * (`lib/custom-fields/parse.ts`). A definition carries no value and no
 * Kinesis Link target -- just a label and a type -- so this is a smaller
 * sibling rather than a shared function with the value parser.
 */
export function parseTemplateFields(data: FormData, key: string = TEMPLATE_FIELDS_FORM_KEY): ParsedTemplateFields {
  const raw = data.get(key);
  if (typeof raw !== "string" || !raw) return { ok: true, fields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The template's fields could not be read. Please try again." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "The template's fields could not be read. Please try again." };

  const fields: TemplateFieldInput[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const label = asString(entry.label).trim();
    if (!label) continue;
    const requestedType = asString(entry.type) as CustomFieldType;
    const type = VALID_TYPES.has(requestedType) ? requestedType : "TEXT";
    fields.push({ id: asString(entry.id) || undefined, label, type });
  }
  return { ok: true, fields };
}

/**
 * Reads an object's values for the template fields it's rendering
 * (KD-035 Phase 3) -- one JSON payload, same shape convention as
 * `parseTemplateFields` and `parseCustomFields`. Only `templateFieldId` and
 * a value travel here: label and type are never editable from an object's
 * own form, since they live only on the `TemplateField` this id points at.
 */
export function parseTemplateFieldValues(data: FormData, key: string = TEMPLATE_FIELD_VALUES_FORM_KEY): ParsedTemplateFieldValues {
  const raw = data.get(key);
  if (typeof raw !== "string" || !raw) return { ok: true, values: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The template's fields could not be read. Please try again." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "The template's fields could not be read. Please try again." };

  const values: TemplateFieldValueInput[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const templateFieldId = asString(entry.templateFieldId);
    if (!templateFieldId) continue;
    values.push({ templateFieldId, value: asString(entry.value).trim(), targetObjectIds: [...new Set(asStringArray(entry.targetObjectIds).filter(Boolean))] });
  }
  return { ok: true, values };
}
