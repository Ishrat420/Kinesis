export const REMINDER_OPTIONS = [
  { days: 365, label: "1 year" },
  { days: 180, label: "6 months" },
  { days: 90, label: "3 months" },
  { days: 30, label: "30 days" },
] as const;

const DAY = 86_400_000;

function atUtcMidnight(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function subtractUtcMonths(value: Date, months: number) {
  const targetMonth = value.getUTCMonth() - months;
  const lastDayOfTargetMonth = new Date(Date.UTC(value.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    targetMonth,
    Math.min(value.getUTCDate(), lastDayOfTargetMonth),
  ));
}

/** Returns the date on which a document's configured reminder period begins. */
export function getExpiryReminderDate(expiryDate: Date, prompt: number) {
  const expiry = atUtcMidnight(expiryDate);

  // These values are persisted as day counts for backwards compatibility, but
  // their user-facing options represent calendar periods rather than fixed days.
  if (prompt === 365) return subtractUtcMonths(expiry, 12);
  if (prompt === 180) return subtractUtcMonths(expiry, 6);
  if (prompt === 90) return subtractUtcMonths(expiry, 3);

  return new Date(expiry.getTime() - prompt * DAY);
}

export type ExpiryUrgency = "neutral" | "safe" | "soon" | "expired";

export function getExpiryDetails(expiryDate: Date | null, prompt: number, now = new Date()) {
  if (!expiryDate) {
    return { label: "No expiry date", urgency: "neutral" as const, status: "Active" };
  }

  const today = atUtcMidnight(now);
  const expiry = atUtcMidnight(expiryDate);
  const differenceInDays = Math.round((expiry.getTime() - today.getTime()) / DAY);
  const expired = differenceInDays < 0;
  const withinReminderPeriod = today >= getExpiryReminderDate(expiry, prompt);
  const label = expired
    ? `Expired ${formatDuration(expiry, today)} ago`
    : `${formatDuration(today, expiry)} left`;

  return {
    label,
    urgency: expired ? "expired" as const : withinReminderPeriod ? "soon" as const : "safe" as const,
    status: expired ? "Expired" : withinReminderPeriod ? "Expiring soon" : "Active",
  };
}

function formatDuration(start: Date, end: Date) {
  const cursor = new Date(start);
  let years = end.getUTCFullYear() - cursor.getUTCFullYear();
  cursor.setUTCFullYear(cursor.getUTCFullYear() + years);
  if (cursor > end) {
    years -= 1;
    cursor.setUTCFullYear(cursor.getUTCFullYear() - 1);
  }

  let months = (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + end.getUTCMonth() - cursor.getUTCMonth();
  cursor.setUTCMonth(cursor.getUTCMonth() + months);
  if (cursor > end) {
    months -= 1;
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  const days = Math.round((end.getTime() - cursor.getTime()) / DAY);
  const parts = [
    years ? `${years} ${years === 1 ? "year" : "years"}` : "",
    months ? `${months} ${months === 1 ? "month" : "months"}` : "",
    days || (!years && !months) ? `${days} ${days === 1 ? "day" : "days"}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}
