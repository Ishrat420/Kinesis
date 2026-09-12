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
export type DisplayKind = "date" | "number" | "currency" | "percent" | "status" | "text" | "link-count";

/** A status badge doesn't wrap, so its label needs a hard cap, not just an ellipsis rule that only kicks in sometimes. */
const STATUS_CHAR_CAP = 24;
/** A single preview line's budget -- generous enough to read as a sentence fragment, short enough to never wrap a card. */
const TEXT_CHAR_CAP = 40;

function truncate(value: string, cap: number) {
  return value.length > cap ? `${value.slice(0, cap - 1).trimEnd()}…` : value;
}

/**
 * A custom field's stored `type` (and, for NUMBER, its `numberFormat`
 * refinement) resolved to a display kind -- almost 1:1 off `type`, except
 * NUMBER needs `numberFormat` to pick between number/currency/percent.
 * CHECKBOX and LINK have no display kind: neither maps onto anything in the
 * closed set above, so a field of either type is never offered in the
 * preview-field picker and never reaches this function from one that's
 * already configured (a field removed from the type it needs is dropped the
 * same way a deleted field is -- see Template.previewFields).
 */
export function resolveKind(type: CustomFieldType, numberFormat?: NumberFieldFormat): DisplayKind | null {
  switch (type) {
    case "TEXT": return "text";
    case "DATE": return "date";
    case "KINESIS_LINK": return "link-count";
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
