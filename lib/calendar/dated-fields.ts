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

/**
 * A DATE-type field's editor now stores its value in the yyyy-mm-dd a native
 * `<input type="date">` submits, which `new Date()` already understands. But
 * a field saved before that editor existed can still hold a plain
 * "dd/mm/yyyy" string from the old free-text input -- and `new Date()` does
 * not parse that format. Worse than simply failing on it: for a day-of-month
 * of 12 or less, `new Date("dd/mm/yyyy")` still parses, silently as the
 * wrong date, by reading it as mm/dd/yyyy (e.g. "01/02/2026" becomes
 * 2 January, not 1 February). Parsing that legacy shape explicitly first
 * means this can only either read the day such a field actually holds or
 * reject it -- never quietly swap day and month.
 */
const DD_MM_YYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Parses a DATE-type field's stored value, or null if it isn't a valid date. */
export function parseDatedFieldValue(value: string): Date | null {
  const match = DD_MM_YYYY.exec(value.trim());
  if (match) {
    const [, day, month, year] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  // Not every DATE field is guaranteed to hold that exact editor format
  // forever (a future editor, an import, a direct API write), so a value
  // that already parses on its own -- an ISO date, say -- still counts.
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
