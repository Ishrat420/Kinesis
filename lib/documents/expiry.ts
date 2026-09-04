export const REMINDER_OPTIONS = [
  { days: 365, label: "1 year" },
  { days: 180, label: "6 months" },
  { days: 90, label: "3 months" },
  { days: 30, label: "30 days" },
] as const;

const DAY = 86_400_000;

/** The status an archived document reports, whatever its expiry date says. */
export const ARCHIVED_STATUS = "Archived";

function atUtcMidnight(value: Date) {
  return startOfUtcDay(value)!;
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

export type ExpiryUrgency = "neutral" | "safe" | "soon" | "expired" | "archived";

/**
 * What a document's status chip reads, and the tone it is drawn in.
 *
 * Archiving beats the date: an archived document is out of the reminder cycle
 * entirely, so counting down to an expiry that will never be raised would be a
 * promise nothing keeps. Every reader goes through here rather than through
 * `getExpiryDetails` directly, so the status stored on the record, the chip on
 * the page and the list's badge cannot disagree about an archived document.
 */
export function getDocumentState(
  document: { expiryDate: Date | null; prompt: number; archived?: boolean },
  now = new Date(),
) {
  if (document.archived) {
    return { label: ARCHIVED_STATUS, urgency: "archived" as const, status: ARCHIVED_STATUS };
  }
  return getExpiryDetails(document.expiryDate, document.prompt, now);
}

export function getExpiryDetails(expiryDate: Date | null, prompt: number, now = new Date()) {
  if (!expiryDate) {
    return { label: "No expiry date", urgency: "neutral" as const, status: "Active" };
  }

  const today = atUtcMidnight(now);
  const expiry = atUtcMidnight(expiryDate);
  const differenceInDays = Math.round((expiry.getTime() - today.getTime()) / DAY);
  const expired = differenceInDays < 0;
  const withinReminderPeriod = today >= getExpiryReminderDate(expiry, prompt);
  const label = formatExpiry(expiry, today);

  return {
    label,
    urgency: expired ? "expired" as const : withinReminderPeriod ? "soon" as const : "safe" as const,
    status: expired ? "Expired" : withinReminderPeriod ? "Expiring soon" : "Active",
  };
}
import { formatExpiry, startOfUtcDay } from "@/lib/dates";
