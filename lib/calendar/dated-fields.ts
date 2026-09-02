/**
 * A custom field (on a Document or a CustomItem) belongs on the calendar
 * when it is typed as a date, never by guessing from its label. A label like
 * "Due Date" only matches an English regex; a field labelled in any other
 * language, or just named something else entirely, would be invisible to a
 * label-pattern check even though it is exactly as date-shaped. The `type`
 * a person chose when creating the field is the one signal that means the
 * same thing regardless of what they called it.
 */
export type DatedField = { id: string; label: string; value: string; type: string };

/** Parses a DATE-type field's stored value, or null if it isn't a valid date. */
export function parseDatedFieldValue(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The DATE-type fields, each paired with its parsed value, skipping anything unparseable. */
export function resolveDatedFields(fields: readonly DatedField[]): { id: string; label: string; date: Date }[] {
  return fields
    .filter((field) => field.type === "DATE")
    .flatMap((field) => {
      const date = parseDatedFieldValue(field.value);
      return date ? [{ id: field.id, label: field.label, date }] : [];
    });
}
