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

/**
 * The subject of a reminder about an important date: "Karen's Birthday" for
 * one personal to a single person, or "Alex and Karen's Anniversary" for one
 * shared between two people -- a date entered under a Relationship's own
 * "Shared Important Dates" rather than on one Person's page alone.
 *
 * `pairedWithName` is the other half of that pair (resolved by the caller,
 * since knowing whether that half is the account owner -- and what to call
 * them -- needs data this pure function doesn't have). Joint possession
 * names both people but puts the apostrophe-s on the last one only ("Tom and
 * Jerry's house" is their shared house, not two separate ones), the same
 * convention English already uses for anything two people own together.
 */
export function relationshipDateSubject(personName: string, pairedWithName: string | null) {
  return pairedWithName ? `${pairedWithName} and ${possessiveName(personName)}` : possessiveName(personName);
}

/**
 * Every calendar date this important date falls on within `[start, end]`.
 *
 * `getNextOccurrence` answers the bell's question -- "what is the one date
 * still ahead of me?" -- which is deliberately a single date and never a past
 * one. A calendar asks a different question: it renders a window that may sit
 * wholly in the past or wholly in the future, and a yearly date belongs on
 * every occurrence inside it. Asking `getNextOccurrence` instead would pin
 * this year's birthday and leave next year's bare.
 */
export function occurrencesInRange(importantDate: ImportantDateOccurrenceInput, start: Date, end: Date): Date[] {
  const date = startOfUtcDay(importantDate.date)!;
  if (!importantDate.repeatsYearly) return date >= start && date <= end ? [date] : [];

  const occurrences: Date[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const occurrence = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
    if (occurrence >= start && occurrence <= end) occurrences.push(occurrence);
  }
  return occurrences;
}
