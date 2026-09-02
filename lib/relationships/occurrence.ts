import { startOfUtcDay } from "@/lib/dates";

export type ImportantDateOccurrenceInput = { date: Date; repeatsYearly: boolean };

/**
 * The next calendar date this important date falls on, on or after `today`.
 *
 * A yearly date (a birthday, an anniversary) rolls forward to this year's
 * occurrence, or next year's once this year's has already passed -- it is
 * always "next" and never overdue. A one-off date (a specific event with no
 * yearly meaning) is only ever its own stored date: it is "next" right up
 * until that day passes, and has no next occurrence after that, so it drops
 * out of any reminder or upcoming-list window for good rather than resurfacing
 * a year later.
 */
export function getNextOccurrence(importantDate: ImportantDateOccurrenceInput, today: Date): Date | null {
  const date = startOfUtcDay(importantDate.date)!;
  if (!importantDate.repeatsYearly) return date >= today ? date : null;

  const thisYear = new Date(Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return thisYear >= today ? thisYear : new Date(Date.UTC(today.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
}

/** "Alice's Birthday", "Chris's Birthday" -- the possessive form of a name for reminder wording. */
export function possessiveName(name: string) {
  return `${name}${name.toLowerCase().endsWith("s") ? "'" : "'s"}`;
}
