const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * The date a practice's recurrence is measured from.
 *
 * `anchorDate` is what every practice written since the column existed carries.
 * `createdAt` is the fallback for rows that predate it, and is what the schedule
 * used to be derived from implicitly -- which is exactly why the column exists:
 * the map rewrote these rows on every save, so `createdAt` moved, and a weekly
 * practice quietly relocated to whatever weekday the map was last touched on.
 */
export function practiceAnchor(practice: { anchorDate: Date | null; createdAt: Date }) {
  return practice.anchorDate ?? practice.createdAt;
}

export function occurrencesForCadence(cadence: string | null, anchor: Date, start: Date, end: Date) {
  if (!cadence) return [];
  const normalized = cadence.trim().toLowerCase();
  const dates: Date[] = [];
  const namedDay = weekdays.findIndex((day) => normalized.includes(day));
  const isDaily = /daily|every day/.test(normalized);
  // Claimed before weekly: "every two weeks" contains "week", and a fortnightly
  // practice read as weekly would show up twice as often as it happens.
  const isFortnightly = /fortnight|every two weeks|every 2 weeks/.test(normalized);
  const isWeekly = !isFortnightly && (/weekly|every week|every (sun|mon|tue|wed|thu|fri|sat)/.test(normalized) || namedDay >= 0);
  const isMonthly = /monthly|every month/.test(normalized);
  const isYearly = /yearly|annually|every year/.test(normalized);
  if (!isDaily && !isWeekly && !isFortnightly && !isMonthly && !isYearly) return dates;

  const anchorDay = utcDay(anchor);
  for (let cursor = utcDay(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (cursor < anchorDay) continue;
    // Whole days since the anchor, which is what tells a fortnightly practice's
    // week from the week it skips. Both ends are UTC midnight, so this is exact.
    const daysSinceAnchor = Math.round((cursor.getTime() - anchorDay.getTime()) / DAY_MS);
    const matches = isDaily
      || (isWeekly && cursor.getUTCDay() === (namedDay >= 0 ? namedDay : anchor.getUTCDay()))
      || (isFortnightly && daysSinceAnchor % 14 === 0)
      || (isMonthly && cursor.getUTCDate() === anchor.getUTCDate())
      || (isYearly && cursor.getUTCMonth() === anchor.getUTCMonth() && cursor.getUTCDate() === anchor.getUTCDate());
    if (matches) dates.push(new Date(cursor));
  }
  return dates;
}
