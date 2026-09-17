import type { CustomFieldType, NumberFieldFormat } from "./types";
import { parseDatedFieldValue } from "@/lib/calendar/dated-fields";
import { formatDeadline } from "@/lib/dates";
import { formatDecimal, formatMoney, formatPercent } from "@/lib/format/numbers";

/**
 * The closed set of ways a Kinesis Link preview field can render (KD-042) --
 * one formatter per kind below, reused by every Module and every Custom
 * Module field. Never one formatter per Module and never a per-field
 * override: the render step only ever deals with a `{value, kind}` pair, not
 * which field or Module it came from.
 */
export type DisplayKind = "date" | "number" | "currency" | "percent" | "status" | "text" | "link-count" | "boolean";

/** A status badge doesn't wrap, so its label needs a hard cap, not just an ellipsis rule that only kicks in sometimes. */
const STATUS_CHAR_CAP = 24;
/** A single preview line's budget -- generous enough to read as a sentence fragment, short enough to never wrap a card. */
const TEXT_CHAR_CAP = 40;
/**
 * A stat tile's label sits above its value in small caps, naming it rather
 * than describing it -- "Country", "Interest rate", "Relationship" -- so its
 * budget is tighter than a value's. It's the same cap a status badge gets,
 * for the same reason: neither wraps, so both need a hard limit rather than
 * an ellipsis rule that only sometimes applies. Every existing hardcoded
 * label is well under this; it exists for the labels that aren't hardcoded
 * (a custom field's name, a document's own relabelled field, a goal's
 * free-text unit), none of which are length-limited at the point they're
 * typed in.
 */
const LABEL_CHAR_CAP = 24;

function truncate(value: string, cap: number) {
  return value.length > cap ? `${value.slice(0, cap - 1).trimEnd()}…` : value;
}

/** Caps a preview stat's label the same way a value is capped -- trimmed, then truncated with an ellipsis rather than left to overflow its tile. */
export function truncateLabel(label: string): string {
  return truncate(label.trim(), LABEL_CHAR_CAP);
}

/**
 * A custom field's stored `type` (and, for NUMBER, its `numberFormat`
 * refinement) resolved to a display kind -- almost 1:1 off `type`, except
 * NUMBER needs `numberFormat` to pick between number/currency/percent.
 * LINK has no display kind: it maps onto nothing in the closed set above, so
 * a LINK field is never offered in the preview-field picker and never
 * reaches this function from one that's already configured (a field removed
 * from the type it needs is dropped the same way a deleted field is -- see
 * Template.previewFields).
 */
export function resolveKind(type: CustomFieldType, numberFormat?: NumberFieldFormat): DisplayKind | null {
  switch (type) {
    case "TEXT": return "text";
    case "DATE": return "date";
    case "KINESIS_LINK": return "link-count";
    case "CHECKBOX": return "boolean";
    case "NUMBER": return numberFormat === "CURRENCY" ? "currency" : numberFormat === "PERCENT" ? "percent" : "number";
    default: return null;
  }
}

/**
 * Formats one preview field's raw value for its resolved kind, or `null`
 * when there's nothing worth showing on the card -- an empty value, a date
 * string that doesn't parse, a Kinesis Link with nothing linked. The card
 * drops a `null` entry entirely rather than rendering an empty or
 * broken-looking line ("omitted gracefully").
 *
 * Free of server-only imports so the same function drives both the live
 * card (server-fetched) and the Template settings page's live preview
 * (client-rendered, from values already on the page).
 */
export function formatPreviewValue(
  kind: DisplayKind,
  raw: { value?: string; linkCount?: number },
  { locale, currency, today }: { locale: string; currency: string; today: Date },
): string | null {
  if (kind === "link-count") {
    const count = raw.linkCount ?? 0;
    return count > 0 ? `${count} linked` : null;
  }

  // Unlike every other kind, a checkbox always has a real value -- unchecked
  // is a state, not an absence of one -- so this is the one kind that never
  // "drops" for a blank/missing raw value the way the fallthrough below does.
  if (kind === "boolean") return raw.value === "true" ? "True" : "False";

  const value = raw.value?.trim();
  if (!value) return null;

  if (kind === "date") {
    const date = parseDatedFieldValue(value);
    return date ? formatDeadline(date, today) : null;
  }
  if (kind === "number" || kind === "currency" || kind === "percent") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    if (kind === "currency") return formatMoney(amount, locale, currency);
    if (kind === "percent") return formatPercent(amount, locale);
    return formatDecimal(amount, locale);
  }
  if (kind === "status") return truncate(value, STATUS_CHAR_CAP);
  return truncate(value, TEXT_CHAR_CAP);
}

/** A made-up raw value per kind, used only when nothing exists under a template yet so its live preview can still show a representative value. */
export function placeholderPreviewRaw(kind: DisplayKind, todayIso: string): { value?: string; linkCount?: number } {
  switch (kind) {
    case "date": {
      const date = new Date(todayIso);
      date.setUTCDate(date.getUTCDate() + 21);
      return { value: date.toISOString().slice(0, 10) };
    }
    case "number": return { value: "42" };
    case "currency": return { value: "1234" };
    case "percent": return { value: "12.5" };
    case "status": return { value: "Example" };
    case "text": return { value: "Example text" };
    case "link-count": return { linkCount: 2 };
    case "boolean": return { value: "true" };
    default: return {};
  }
}

/**
 * The raw value a preview field should format from, given an optional
 * sample object's stored values. A missing value under a real sample is not
 * the same as no sample at all: a CHECKBOX field never gets an ObjectField
 * row written while it's still unchecked (saveTemplateFieldValues treats ""
 * as nothing to persist), so `sample.values[fieldId]` comes back `undefined`
 * for it -- and `formatPreviewValue`'s boolean case needs `{ value: "" }`,
 * not `undefined`, to render "False" rather than being read as absent. This
 * mirrors getCustomItemPreviews' own `?? ""` default for the same reason, so
 * every preview consumer (this settings page included) agrees with the real
 * linked card on what an untouched checkbox shows.
 */
export function resolvePreviewFieldRaw(
  kind: DisplayKind,
  isDueDate: boolean,
  sample: { dueDate: string; values: Record<string, { value: string; linkCount: number }> } | null,
  fieldId: string,
  todayIso: string,
): { value?: string; linkCount?: number } {
  if (isDueDate) return { value: sample?.dueDate };
  if (!sample) return placeholderPreviewRaw(kind, todayIso);
  return sample.values[fieldId] ?? { value: "" };
}
