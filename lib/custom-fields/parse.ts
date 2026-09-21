import { CUSTOM_FIELD_TYPES, CUSTOM_FIELDS_FORM_KEY, type CustomFieldType, type CustomFieldValue } from "./types";
import { checkLength, checkNumberMagnitude, LINK_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";

export type ParsedCustomFields = { ok: true; fields: CustomFieldValue[] } | { ok: false; error: string };

const VALID_TYPES = new Set(CUSTOM_FIELD_TYPES.map(({ value }) => value));

/** A raw parsed JSON value narrowed down to "looks like an object", nothing more -- everything past this is read defensively. */
type Unknown = Record<string, unknown>;
const isRecord = (value: unknown): value is Unknown => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" ? value : "";
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Reads a custom-fields editor's JSON payload into the fields it describes,
 * or says what is wrong with them.
 *
 * The payload is client-supplied, so it is read the way any request body
 * would be -- `JSON.parse` can throw or hand back something that is not an
 * array of field-shaped objects at all, and every property is read through a
 * narrowing helper rather than trusted. This is the one place that happens;
 * every caller (documents, custom items, goals) used to carry its own copy of
 * the equivalent positional-array decoding, which is what let a Kinesis Link
 * check, a blank-label skip, or a fallback to TEXT for an unrecognised type
 * drift between them.
 *
 * The Kinesis Link check returns a message rather than throwing: Next.js
 * redacts a thrown error before it reaches the browser, which used to leave
 * the owner looking at "An unexpected error occurred" instead of the name of
 * the field to go and fill in -- and the form they had just typed into
 * replaced by a crash screen.
 */
export function parseCustomFields(data: FormData, key: string = CUSTOM_FIELDS_FORM_KEY): ParsedCustomFields {
  const raw = data.get(key);
  if (typeof raw !== "string" || !raw) return { ok: true, fields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The form's custom fields could not be read. Please try again." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "The form's custom fields could not be read. Please try again." };

  const fields: CustomFieldValue[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const label = asString(entry.label).trim();
    if (!label) continue;
    const requestedType = asString(entry.type) as CustomFieldType;
    const type = VALID_TYPES.has(requestedType) ? requestedType : "TEXT";
    const targetObjectIds = type === "KINESIS_LINK" ? [...new Set(asStringArray(entry.targetObjectIds).filter(Boolean))] : [];
    const existingId = asString(entry.id) || undefined;
    // A brand-new Kinesis Link field is pointless with nothing chosen, so it
    // is required here. An existing field can reach this with no targets left
    // through no action of the person editing -- every object it pointed at
    // was deleted elsewhere, which removes just those FieldLink rows (see the
    // model's own comment) and leaves the field itself in place -- and
    // blocking every other change on this form until they come back and
    // repair it is worse than leaving it empty.
    if (type === "KINESIS_LINK" && !targetObjectIds.length && !existingId) return { ok: false, error: `Choose what “${label}” links to.` };
    const value = type === "KINESIS_LINK" ? "" : asString(entry.value).trim();
    // KD-043: length/range limits by kind -- DATE, CHECKBOX, and KINESIS_LINK
    // aren't free text, so they need none. An ad-hoc TEXT field has no
    // "Notes" (multiline) variant the way a TemplateField can (that flag
    // lives only on TemplateField), so it always gets the single-line tier.
    if (type === "TEXT") {
      const error = checkLength(value, TEXT_LIMIT, `“${label}”`);
      if (error) return { ok: false, error };
    } else if (type === "LINK") {
      const error = checkLength(value, LINK_LIMIT, `“${label}”`);
      if (error) return { ok: false, error };
    } else if (type === "NUMBER" && value) {
      const error = checkNumberMagnitude(Number(value), `“${label}”`);
      if (error) return { ok: false, error };
    }
    fields.push({
      id: existingId,
      label,
      value,
      type,
      targetObjectIds,
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
 *
 * A Kinesis Link field's targets get the same treatment one level down: each
 * `targetObjectIds` entry becomes a `FieldLink` create, in the order the
 * person added them, with its own fresh id.
 */
export function prepareCustomFields(fields: CustomFieldValue[]) {
  return fields.map(({ id, targetObjectIds, ...field }, position) => ({
    ...field,
    id: id ?? crypto.randomUUID(),
    position,
    links: {
      create: (targetObjectIds ?? []).map((targetObjectId, linkPosition) => ({
        id: crypto.randomUUID(),
        targetObjectId,
        position: linkPosition,
      })),
    },
  }));
}
