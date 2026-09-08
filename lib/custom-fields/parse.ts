import { CUSTOM_FIELD_TYPES, type CustomFieldType, type CustomFieldValue, type FieldNames } from "./types";

export type ParsedCustomFields = { ok: true; fields: CustomFieldValue[] } | { ok: false; error: string };

const VALID_TYPES = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));

/**
 * Reads a custom-fields editor's positional `FormData` arrays into the
 * fields it describes, or says what is wrong with them.
 *
 * `CustomFieldsEditor` posts one label, one type, one value and one target
 * per field, at the same array index -- so a field with nothing typed into
 * its label yet contributes an empty slot at every array rather than being
 * skippable outright, and this is the one place that positional decoding
 * happens. Every caller (documents, custom items, goals) used to carry its
 * own copy; a Kinesis Link check, a blank-label skip, or a fallback to TEXT
 * for an unrecognised type had to be fixed in each of them in turn.
 *
 * The Kinesis Link check returns a message rather than throwing: Next.js
 * redacts a thrown error before it reaches the browser, which used to leave
 * the owner looking at "An unexpected error occurred" instead of the name of
 * the field to go and fill in -- and the form they had just typed into
 * replaced by a crash screen.
 */
export function parseCustomFields(data: FormData, names: FieldNames): ParsedCustomFields {
  const ids = data.getAll(names.id).map(String);
  const labels = data.getAll(names.label).map(String);
  const values = data.getAll(names.value).map(String);
  const types = data.getAll(names.type).map(String);
  const targets = data.getAll(names.target).map(String);
  const fields: CustomFieldValue[] = [];
  for (const [index, label] of labels.entries()) {
    if (!label.trim()) continue;
    const requestedType = types[index] as CustomFieldType;
    const type = VALID_TYPES.has(requestedType) ? requestedType : "TEXT";
    const targetObjectId = type === "KINESIS_LINK" ? (targets[index] ?? "").trim() : "";
    if (type === "KINESIS_LINK" && !targetObjectId) return { ok: false, error: `Choose what “${label.trim()}” links to.` };
    fields.push({
      id: ids[index] || undefined,
      label: label.trim(),
      value: type === "KINESIS_LINK" ? "" : (values[index] ?? "").trim(),
      type,
      targetObjectId: targetObjectId || null,
    });
  }
  return { ok: true, fields };
}

/**
 * Assigns each parsed field the identity and position its write needs: an id,
 * for a field that did not already have one, and this array's index as
 * position -- taken after `parseCustomFields` has already dropped the blank
 * ones, so a position is never left with a gap where a since-removed field
 * used to sit.
 */
export function prepareCustomFields(fields: CustomFieldValue[]) {
  return fields.map(({ id, ...field }, position) => ({ ...field, id: id ?? crypto.randomUUID(), position }));
}
