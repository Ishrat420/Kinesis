export const REMINDER_OPTIONS = [
  { days: 365, label: "1 year" },
  { days: 180, label: "6 months" },
  { days: 90, label: "3 months" },
  { days: 30, label: "30 days" },
] as const;

/**
 * The reminder control's last option (KD-026): keep the expiry date and every
 * surface that states it, but never warn ahead of it. Stored as a null
 * `prompt`; this is only its form value, since a `<select>` can't submit null.
 */
export const NO_REMINDER_VALUE = "none";
export const NO_REMINDER_LABEL = "No reminders";

/** Reads the reminder control's submitted value. Anything unrecognised still falls back to the 6-month default, as it always has. */
export function parseReminderPrompt(value: string): number | null {
  if (value === NO_REMINDER_VALUE) return null;
  const days = Number(value);
  return REMINDER_OPTIONS.some((option) => option.days === days) ? days : 180;
}

/** The reminder control's form value for a stored `prompt`. */
export const reminderFormValue = (prompt: number | null) => (prompt === null ? NO_REMINDER_VALUE : String(prompt));

/** How a stored `prompt` reads to the user: "6 months before expiry", or "No reminders". */
export function reminderLabel(prompt: number | null) {
  if (prompt === null) return NO_REMINDER_LABEL;
  return `${REMINDER_OPTIONS.find((option) => option.days === prompt)?.label ?? `${prompt} days`} before expiry`;
}

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

/** Returns the date on which a document's configured reminder period begins, or null when it is set to "No reminders". */
export function getExpiryReminderDate(expiryDate: Date, prompt: number | null) {
  if (prompt === null) return null;
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
  document: { expiryDate: Date | null; prompt: number | null; archived?: boolean },
  today: Date,
) {
  if (document.archived) {
    return { label: ARCHIVED_STATUS, urgency: "archived" as const, status: ARCHIVED_STATUS };
  }
  return getExpiryDetails(document.expiryDate, document.prompt, today);
}

/**
 * "Expiring soon" is the reminder window seen as a status, so a document set
 * to "No reminders" never enters it (KD-026): it reads Active until the expiry
 * date passes, then Expired exactly as before.
 */
export function getExpiryDetails(expiryDate: Date | null, prompt: number | null, today: Date) {
  if (!expiryDate) {
    return { label: "No expiry date", urgency: "neutral" as const, status: "Active" };
  }

  const currentDay = atUtcMidnight(today);
  const expiry = atUtcMidnight(expiryDate);
  const differenceInDays = Math.round((expiry.getTime() - currentDay.getTime()) / DAY);
  const expired = differenceInDays < 0;
  const reminderDate = getExpiryReminderDate(expiry, prompt);
  const withinReminderPeriod = reminderDate !== null && currentDay >= reminderDate;
  const label = formatExpiry(expiry, currentDay);

  return {
    label,
    urgency: expired ? "expired" as const : withinReminderPeriod ? "soon" as const : "safe" as const,
    status: expired ? "Expired" : withinReminderPeriod ? "Expiring soon" : "Active",
  };
}
import { formatExpiry, startOfUtcDay } from "@/lib/dates";
