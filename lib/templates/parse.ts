import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields/types";

export const TEMPLATE_FIELDS_FORM_KEY = "templateFieldsPayload";

export type TemplateFieldInput = { id?: string; label: string; type: CustomFieldType };
export type ParsedTemplateFields = { ok: true; fields: TemplateFieldInput[] } | { ok: false; error: string };

const VALID_TYPES = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));

type Unknown = Record<string, unknown>;
const isRecord = (value: unknown): value is Unknown => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" ? value : "";

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
