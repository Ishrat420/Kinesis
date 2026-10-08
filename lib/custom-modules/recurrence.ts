import { addUtcDays, startOfUtcDay } from "@/lib/dates";

/**
 * KD-055: a Recurring Due Date's repeat rule. Mirrors the Prisma
 * `RecurrenceRule` enum value for value, declared here rather than imported
 * so client components can use it without pulling in @prisma/client.
 */
export const RECURRENCE_RULES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY", "YEARLY", "EVERY_N_DAYS"] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

/** The Repeats dropdown's options, in the order the ticket fixes. */
export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: "WEEKLY", label: "Every week" },
  { value: "FORTNIGHTLY", label: "Every fortnight" },
  { value: "MONTHLY", label: "Every month" },
  { value: "YEARLY", label: "Every year" },
  { value: "EVERY_N_DAYS", label: "Every N days" },
];

/** Upper bound on N for "Every N days" (ADR-015-style limit; the database enforces the same range). */
export const RECURRENCE_DAYS_MAX = 999;

/**
 * Hard cap on how many occurrences one item contributes to one calendar
 * request -- a year of a daily rule. The month grid shows at most 42 days,
 * so this never bites today; it bounds any wider view added later.
 */
export const MAX_PROJECTED_OCCURRENCES = 366;

/**
 * A stored rule. `days` is set only for EVERY_N_DAYS; `anchorDay` (the day of
 * the month the rule started on, 1-31) only for MONTHLY and YEARLY.
 */
export type Recurrence = { rule: RecurrenceRule; days: number | null; anchorDay: number | null };

export function isRecurrenceRule(value: string): value is RecurrenceRule {
  return (RECURRENCE_RULES as readonly string[]).includes(value);
}

/** "Every month", "Every 90 days". */
export function recurrenceLabel(recurrence: Pick<Recurrence, "rule" | "days">): string {
  if (recurrence.rule === "EVERY_N_DAYS") return `Every ${recurrence.days} ${recurrence.days === 1 ? "day" : "days"}`;
  return RECURRENCE_OPTIONS.find((option) => option.value === recurrence.rule)!.label;
}

/**
 * Builds the stored rule for a due date. The anchor is taken from the date
 * itself, so (re)setting the date (re)anchors a monthly or yearly rule.
 */
export function buildRecurrence(rule: RecurrenceRule, dueDate: Date, days: number | null): Recurrence {
  return {
    rule,
    days: rule === "EVERY_N_DAYS" ? days : null,
    anchorDay: rule === "MONTHLY" || rule === "YEARLY" ? dueDate.getUTCDate() : null,
  };
}

const stepDays = (recurrence: Recurrence) =>
  recurrence.rule === "WEEKLY" ? 7 : recurrence.rule === "FORTNIGHTLY" ? 14 : recurrence.rule === "EVERY_N_DAYS" ? recurrence.days ?? 0 : null;
const stepMonths = (recurrence: Recurrence) => (recurrence.rule === "YEARLY" ? 12 : 1);

/**
 * `months` calendar months after `from`'s month, on the anchor day -- clamped
 * to the last day of a shorter month. Clamping from the anchor rather than
 * from the previous occurrence is what brings 28 Feb back to 31 Mar.
 */
function monthsAfter(from: Date, months: number, anchorDay: number): Date {
  const first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(anchorDay, daysInMonth)));
}

/** The `index`-th occurrence after `dueDate` (0 is `dueDate` itself). Always a UTC midnight. */
export function occurrenceAt(dueDate: Date, recurrence: Recurrence, index: number): Date {
  const due = startOfUtcDay(dueDate)!;
  const days = stepDays(recurrence);
  if (days !== null) return addUtcDays(due, days * index);
  return monthsAfter(due, stepMonths(recurrence) * index, recurrence.anchorDay ?? due.getUTCDate());
}

/** The smallest index >= `minIndex` whose occurrence falls on or after `target`. Jumps straight there rather than stepping one by one. */
function firstIndexOnOrAfter(dueDate: Date, recurrence: Recurrence, target: Date, minIndex: number): number {
  const due = startOfUtcDay(dueDate)!;
  const day = startOfUtcDay(target)!;
  if (day <= due) return minIndex;
  const days = stepDays(recurrence);
  let index: number;
  if (days !== null) {
    if (days <= 0) return minIndex;
    index = Math.ceil((day.getTime() - due.getTime()) / 86_400_000 / days);
  } else {
    const monthGap = (day.getUTCFullYear() - due.getUTCFullYear()) * 12 + (day.getUTCMonth() - due.getUTCMonth());
    index = Math.floor(monthGap / stepMonths(recurrence));
  }
  index = Math.max(index, minIndex);
  // At most a step or two of correction after the jump (month clamping can land a day short).
  while (occurrenceAt(due, recurrence, index) < day) index += 1;
  return index;
}

/**
 * The next due date once the current occurrence is completed (Decision 5):
 * one step from the current due date -- not from today, so completing early
 * doesn't drift the schedule -- and, if that is still in the past, onward to
 * the first occurrence on or after today, so a long-overdue item never lands
 * straight back in overdue. Returns the new date and how many occurrences
 * were skipped to catch up.
 */
export function nextDueAfterCompletion(dueDate: Date, recurrence: Recurrence, today: Date): { next: Date; skipped: number } {
  const index = firstIndexOnOrAfter(dueDate, recurrence, today, 1);
  return { next: occurrenceAt(dueDate, recurrence, index), skipped: index - 1 };
}

/** The occurrence right after the current one -- what "Next event" shows. */
export function followingOccurrence(dueDate: Date, recurrence: Recurrence): Date {
  return occurrenceAt(dueDate, recurrence, 1);
}

/**
 * Every occurrence from `dueDate` onward that falls in `[start, end]`, for
 * the calendar (Decision 7) -- never one before the current due date, since
 * past occurrences are History, not projections. Capped at `cap`.
 */
export function occurrencesInRange(dueDate: Date, recurrence: Recurrence, start: Date, end: Date, cap = MAX_PROJECTED_OCCURRENCES): Date[] {
  if (stepDays(recurrence) === 0) return [];
  const result: Date[] = [];
  for (let index = firstIndexOnOrAfter(dueDate, recurrence, start, 0); result.length < cap; index += 1) {
    const occurrence = occurrenceAt(dueDate, recurrence, index);
    if (occurrence > end) break;
    result.push(occurrence);
  }
  return result;
}

/** What the item form submits for a Recurring Due Date field: the date plus the two Repeats inputs, all raw strings. */
export type RecurringDueDateInput = { value: string; recurrenceRule?: string; recurrenceDays?: string };

export type ParsedRecurringDueDate =
  | { ok: true; dueDate: Date | null; rule: RecurrenceRule | null; days: number | null }
  | { ok: false; error: string };

/**
 * Validates a Recurring Due Date field's submitted inputs (Decision 3): the
 * date and the repeat rule are required together -- both blank clears the
 * field, but one without the other is an error rather than a half-saved
 * recurrence -- and "Every N days" needs a whole N from 1 to 999.
 */
export function parseRecurringDueDateInput(input: RecurringDueDateInput, parseDate: (raw: string) => Date | null): ParsedRecurringDueDate {
  const raw = input.value.trim();
  const ruleRaw = (input.recurrenceRule ?? "").trim();
  if (!raw && !ruleRaw) return { ok: true, dueDate: null, rule: null, days: null };
  if (!raw) return { ok: false, error: "Enter a date for the first occurrence." };
  const dueDate = parseDate(raw);
  if (!dueDate) return { ok: false, error: "Enter a valid due date." };
  if (!ruleRaw) return { ok: false, error: "Pick how often it repeats." };
  if (!isRecurrenceRule(ruleRaw)) return { ok: false, error: "Pick how often it repeats." };
  if (ruleRaw !== "EVERY_N_DAYS") return { ok: true, dueDate, rule: ruleRaw, days: null };
  const daysRaw = (input.recurrenceDays ?? "").trim();
  const days = /^\d+$/.test(daysRaw) ? Number(daysRaw) : NaN;
  if (!Number.isInteger(days) || days < 1 || days > RECURRENCE_DAYS_MAX) return { ok: false, error: `N must be a whole number from 1 to ${RECURRENCE_DAYS_MAX}.` };
  return { ok: true, dueDate, rule: ruleRaw, days };
}
