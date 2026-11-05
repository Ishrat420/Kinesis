import { differenceInCalendarDays } from "@/lib/dates";
import type { PushPayload } from "./payload";

/**
 * The overdue reminder push (KD-058): every N days, while anything is
 * overdue, one push saying how many things need attention. It names none of
 * them -- tapping it opens the Needs Attention popup, which lists them all.
 *
 * Pure, so the rules are testable without a database; `runDailyPush`
 * (lib/data/push.ts) supplies the count and the settings.
 */

export const OVERDUE_REMINDER_INTERVAL = { min: 1, max: 30, default: 3 } as const;

/**
 * The query parameter that opens the dashboard with Needs Attention already
 * showing (components/dashboard/NeedsAttentionCard.tsx).
 */
export const NEEDS_ATTENTION_OPEN_PARAM = "attention";
export const NEEDS_ATTENTION_URL = `/?${NEEDS_ATTENTION_OPEN_PARAM}=open`;

/** One tag for every overdue reminder, so a device replaces the last one rather than stacking them. */
export const OVERDUE_REMINDER_TAG = "kinesis-overdue-reminder";

/** Whether a submitted interval is one Settings accepts: a whole number of days, 1 to 30. */
export function isValidOverdueReminderInterval(days: number) {
  return Number.isInteger(days) && days >= OVERDUE_REMINDER_INTERVAL.min && days <= OVERDUE_REMINDER_INTERVAL.max;
}

/**
 * Whether today's run sends the reminder.
 *
 * One cycle per account, never per item: it goes out when something is
 * overdue and at least `intervalDays` have passed since the last one, so an
 * item going overdue mid-cycle simply joins the next count. A day with
 * nothing overdue sends nothing and leaves the last-sent day where it was,
 * and changing the interval counts from that same day. All three dates are
 * the owner's local calendar days.
 */
export function isOverdueReminderDue({ overdueCount, today, lastSentOn, intervalDays }: {
  overdueCount: number;
  today: Date;
  lastSentOn: Date | null;
  intervalDays: number;
}) {
  if (overdueCount <= 0) return false;
  if (!lastSentOn) return true;
  return differenceInCalendarDays(today, lastSentOn) >= intervalDays;
}

/**
 * The push itself. `badge` stays the bell's unread count, like every other
 * push, so the app icon's number keeps meaning one thing.
 */
export function toOverdueReminderPayload(overdueCount: number, unreadCount: number): PushPayload {
  return {
    title: `${overdueCount} ${overdueCount === 1 ? "thing needs" : "things need"} your attention`,
    body: "Tap to see what's overdue.",
    url: NEEDS_ATTENTION_URL,
    tag: OVERDUE_REMINDER_TAG,
    badge: unreadCount,
  };
}
