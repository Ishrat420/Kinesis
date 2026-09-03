import { formatDate, startOfUtcDay, type DateInput } from "@/lib/dates";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { getReminderWindowStart } from "@/lib/reminders/policy";

/**
 * How far ahead of a deadline its reminder opens.
 *
 * Two shapes, because the app genuinely has two. A document carries its own
 * `prompt`, whose "1 year" / "6 months" / "3 months" options are real calendar
 * periods rather than the day counts they are stored as. Everything else uses
 * a lead measured in whole days, read from the user's settings. Flattening
 * both into a single day count would quietly shift document reminders by a day
 * or two around short months, so the distinction is carried in the type.
 */
export type ReminderLead =
  | { kind: "documentPrompt"; prompt: number }
  | { kind: "leadDays"; days: number };

/**
 * The day a deadline's lead-up opens.
 *
 * This is a pure function of the deadline and the lead -- which is the whole
 * reason the calendar can show a reminder that has not happened yet. The
 * notification table cannot: it is a reconciled inbox of what should be
 * alerting *now*, so the engine only ever writes a row once `today` has
 * reached this date and deletes it again afterwards. Every stored `reminderAt`
 * is therefore in the past, and a calendar built on those rows could only ever
 * pin reminders that had already gone off.
 *
 * Both readers go through here, so the pin on the calendar and the moment the
 * bell speaks cannot drift apart -- see tests/unit/calendar-reminder-pins.test.ts,
 * which asserts this against the engine's own candidates.
 */
export function reminderOpensAt(deadline: DateInput, lead: ReminderLead): Date {
  const due = startOfUtcDay(deadline)!;
  return lead.kind === "documentPrompt" ? getExpiryReminderDate(due, lead.prompt) : getReminderWindowStart(due, lead.days);
}

/** A pin names the record it warns about, never what it would say today. */
export function reminderPinTitle(name: string) {
  return `${name} reminder`;
}

/**
 * A pin's wording is built from the deadline it warns about, never from today.
 *
 * The notification's own `message` reads "expires in 30 days" -- true only on
 * the day it was reconciled. Rendered on a pin eleven months out, it would be
 * plainly false, so the deadline is stated as a date instead of a countdown.
 */
export function reminderPinDetail(name: string, deadlineLabel: string, deadline: DateInput, locale?: string) {
  return `Reminder for ${name} · ${deadlineLabel} ${formatDate(deadline, locale)}`;
}
