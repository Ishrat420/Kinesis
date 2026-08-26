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

export type ExpiryUrgency = "neutral" | "safe" | "soon" | "expired";

export function getExpiryDetails(expiryDate: Date | null, prompt: number, now = new Date()) {
  if (!expiryDate) {
    return { label: "No expiry date", urgency: "neutral" as const, status: "Active" };
  }

  const today = atUtcMidnight(now);
  const expiry = atUtcMidnight(expiryDate);
  const differenceInDays = Math.round((expiry.getTime() - today.getTime()) / DAY);
  const expired = differenceInDays < 0;
  const label = expired
    ? `Expired ${formatDuration(expiry, today)} ago`
    : `${formatDuration(today, expiry)} left`;

  return {
    label,
    urgency: expired ? "expired" as const : differenceInDays <= prompt ? "soon" as const : "safe" as const,
    status: expired ? "Expired" : differenceInDays <= prompt ? "Expiring soon" : "Active",
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
    !years && !months ? `${days} ${days === 1 ? "day" : "days"}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}
