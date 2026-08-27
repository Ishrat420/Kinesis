const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function occurrencesForCadence(cadence: string | null, anchor: Date, start: Date, end: Date) {
  if (!cadence) return [];
  const normalized = cadence.trim().toLowerCase();
  const dates: Date[] = [];
  const namedDay = weekdays.findIndex((day) => normalized.includes(day));
  const isDaily = /daily|every day/.test(normalized);
  const isWeekly = /weekly|every week|every (sun|mon|tue|wed|thu|fri|sat)/.test(normalized) || namedDay >= 0;
  const isMonthly = /monthly|every month/.test(normalized);
  const isYearly = /yearly|annually|every year/.test(normalized);
  if (!isDaily && !isWeekly && !isMonthly && !isYearly) return dates;

  for (let cursor = utcDay(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (cursor < utcDay(anchor)) continue;
    const matches = isDaily
      || (isWeekly && cursor.getUTCDay() === (namedDay >= 0 ? namedDay : anchor.getUTCDay()))
      || (isMonthly && cursor.getUTCDate() === anchor.getUTCDate())
      || (isYearly && cursor.getUTCMonth() === anchor.getUTCMonth() && cursor.getUTCDate() === anchor.getUTCDate());
    if (matches) dates.push(new Date(cursor));
  }
  return dates;
}
