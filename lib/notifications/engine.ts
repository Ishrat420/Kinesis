import type { CustomItem, Document, Goal, Milestone, RelationshipImportantDate, Todo, NotificationType } from "@prisma/client";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { differenceInCalendarDays, formatDate, formatDeadline, formatFutureDate, formatCalendarDuration, startOfUtcDay, DAY_COUNT_DISPLAY_LIMIT_DAYS } from "@/lib/dates";
import { getReminderWindowStart } from "@/lib/reminders/policy";
import { notificationKey, type NotificationSource } from "./identity";
import { getNextOccurrence, possessiveName } from "@/lib/relationships/occurrence";
import { isOpenTodoStatus } from "@/lib/todos/status";

type NotificationCandidate = {
  type: NotificationType;
  reminderAt: Date | null;
  timeUntilExpiry: string | null;
  expiryDate: Date;
  documentName: string;
  documentType: string | null;
  message: string;
  actionUrl: string;
};

/** Converts the current state of a document into the alert that should be visible now. */
export function getDocumentNotificationCandidate(
  document: Pick<Document, "id" | "name" | "type" | "expiryDate" | "prompt">,
  today: Date,
  remindersEnabled = true,
  locale?: string,
): NotificationCandidate | null {
  if (!document.expiryDate) return null;

  // Normalised defensively. The engine resolves the owner's day before calling
  // in, but these are exported and comparing an instant against a stored
  // calendar date is precisely the mistake this whole change exists to undo.
  today = startOfUtcDay(today)!;
  const expiryDate = startOfUtcDay(document.expiryDate)!;
  const reminderAt = getExpiryReminderDate(expiryDate, document.prompt);
  const daysRemaining = Math.max(0, differenceInCalendarDays(expiryDate, today));
  // A document remains valid for its full expiry date; it is expired the following day.
  const type = today > expiryDate
    ? "EXPIRED"
    : remindersEnabled && today >= reminderAt
      ? "REMINDER_DUE"
      : null;

  if (!type) return null;
  const timeUntilExpiry = type === "REMINDER_DUE"
    ? daysRemaining < DAY_COUNT_DISPLAY_LIMIT_DAYS ? `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}` : formatCalendarDuration(today, expiryDate)
    : null;

  return {
    type,
    reminderAt,
    timeUntilExpiry,
    expiryDate,
    documentName: document.name,
    documentType: document.type || null,
    message: type === "REMINDER_DUE"
      ? `${document.name} ${daysRemaining === 0 ? "expires today" : `expires in ${timeUntilExpiry}`}`
      : `${document.name} expired on ${formatDate(expiryDate, locale)}`,
    actionUrl: `/documents/${document.id}`,
  };
}

/**
 * Opens a reminder `leadDays` before the due date and keeps it current while
 * the milestone is overdue.
 *
 * `remindersEnabled` gates only the advance phase, from inside this builder
 * -- the same pattern `getTodoNotificationCandidate` already uses, and the
 * one ADR-010's settings-gate tables call for (`MILESTONE_DUE` survives
 * `reminders is not ticked`; only `REMINDER_DUE` blocks). `collectNotifications`
 * used to gate this whole function from the outside instead, which dropped
 * the overdue phase too -- exactly the bug KD-017 Phase 0 found.
 */
export function getMilestoneNotificationCandidate(
  milestone: Pick<Milestone, "id" | "name" | "dueDate"> & { goal: { id: string; name: string } },
  today: Date,
  leadDays = 0,
  remindersEnabled = true,
): NotificationCandidate | null {
  if (!milestone.dueDate) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(milestone.dueDate)!;
  const reminderAt = getReminderWindowStart(dueDate, leadDays);
  const type = today >= dueDate ? "MILESTONE_DUE" : remindersEnabled && today >= reminderAt ? "REMINDER_DUE" : null;
  if (!type) return null;

  return {
    type,
    reminderAt,
    timeUntilExpiry: null,
    expiryDate: dueDate,
    documentName: milestone.name,
    documentType: `Milestone · ${milestone.goal.name}`,
    message: `${milestone.name} is ${formatDeadline(dueDate, today)}`,
    actionUrl: `/goals/${milestone.goal.id}`,
  };
}

/**
 * Opens a reminder `leadDays` before the date's next occurrence. Unlike a
 * document or a milestone, an important date has no overdue state to track:
 * a yearly date rolls forward to next year the moment it passes, and a
 * one-off date simply has no next occurrence once it has passed -- either
 * way `getNextOccurrence` already returns the only date that could still be
 * ahead of `now`, so there is nothing here to distinguish from "due".
 */
export function getRelationshipDateNotificationCandidate(
  importantDate: Pick<RelationshipImportantDate, "id" | "label" | "date" | "repeatsYearly"> & { personName: string },
  today: Date,
  leadDays = 0,
): NotificationCandidate | null {
  today = startOfUtcDay(today)!;
  const occurrence = getNextOccurrence(importantDate, today);
  if (!occurrence) return null;

  const reminderAt = getReminderWindowStart(occurrence, leadDays);
  if (today < reminderAt) return null;

  const title = `${possessiveName(importantDate.personName)} ${importantDate.label}`;
  return {
    type: "REMINDER_DUE",
    reminderAt,
    timeUntilExpiry: null,
    expiryDate: occurrence,
    documentName: title,
    documentType: `Important date · ${importantDate.personName}`,
    message: `${title} is ${formatFutureDate(occurrence, today)}`,
    actionUrl: "/relationships",
  };
}

/**
 * Opens a reminder `leadDays` before the due date, naming the date itself
 * rather than counting down, and keeps it current while the item is
 * overdue -- the same shape as a milestone, since a custom item's due date
 * behaves exactly like one once it stops being merely a bare alert time.
 *
 * `remindersEnabled` gates only the advance phase, from inside this builder
 * -- same reasoning and same KD-017 Phase 0 fix as
 * `getMilestoneNotificationCandidate` above.
 */
export function getCustomItemNotificationCandidate(
  item: Pick<CustomItem, "id" | "name" | "dueDate" | "moduleId">,
  today: Date,
  leadDays = 0,
  locale?: string,
  remindersEnabled = true,
): NotificationCandidate | null {
  if (!item.dueDate) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(item.dueDate)!;
  const reminderAt = getReminderWindowStart(dueDate, leadDays);
  const dueSoon = today < dueDate;
  if (dueSoon && (!remindersEnabled || today < reminderAt)) return null;

  return {
    type: dueSoon ? "REMINDER_DUE" : "CUSTOM_ITEM_DUE",
    reminderAt,
    timeUntilExpiry: null,
    expiryDate: dueDate,
    documentName: item.name,
    documentType: "Custom item",
    message: dueSoon ? `${item.name} is due on ${formatDate(dueDate, locale)}` : `${item.name} is ${formatDeadline(dueDate, today)}`,
    actionUrl: `/custom-modules/${item.moduleId}/items/${item.id}`,
  };
}

/**
 * Opens `leadDays` before the due date and stays current while the To-Do is
 * overdue -- the same two-phase shape as a milestone or custom item (KD-027).
 *
 * Capture still never requires a deadline (ADR-009): most to-dos have no date
 * to count back from, and an undated one is untouched by any of this. But
 * "most to-dos have no date" only ever justified not *requiring* a lead time,
 * never not *offering* one to a to-do whose owner went out of their way to
 * set a due date.
 *
 * The overdue phase, `TODO_DUE`, is still never gated on `remindersEnabled`
 * -- it is a statement of fact, not an advance notice, so turning reminders
 * off must not silence it. The new advance phase, `REMINDER_DUE`, is gated,
 * and that check sits inside this builder rather than around it, following
 * the document builder's pattern -- now also the pattern
 * `getMilestoneNotificationCandidate`/`getCustomItemNotificationCandidate`
 * follow, after KD-017 Phase 3 moved their own `remindersEnabled` gate
 * inside for the same reason (they used to gate from the outside, in
 * `collectNotifications`, which dropped their overdue phase too).
 */
export function getTodoNotificationCandidate(
  todo: Pick<Todo, "id" | "name" | "dueDate" | "status">,
  today: Date,
  leadDays = 0,
  remindersEnabled = true,
): NotificationCandidate | null {
  if (!todo.dueDate || !isOpenTodoStatus(todo.status)) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(todo.dueDate)!;
  const reminderAt = getReminderWindowStart(dueDate, leadDays);
  const type = today >= dueDate ? "TODO_DUE" : remindersEnabled && today >= reminderAt ? "REMINDER_DUE" : null;
  if (!type) return null;

  return {
    type,
    reminderAt,
    timeUntilExpiry: null,
    expiryDate: dueDate,
    documentName: todo.name,
    documentType: "To-do",
    message: `${todo.name} is ${formatDeadline(dueDate, today)}`,
    actionUrl: "/todos",
  };
}

/**
 * A goal past its target date, still Active (KD-028). Unlike every builder
 * above, there is no advance phase at all -- ADR-010's "Other Exceptions" #3
 * decided a goal target is self-imposed and never predicts, only ever
 * states the fact once it's overdue, the same as a document's `EXPIRED` or
 * a to-do's `TODO_DUE`. `getAttentionRecords` only ever hands this builder a
 * goal that is still Active, so there is no separate status check here.
 */
export function getGoalNotificationCandidate(
  goal: Pick<Goal, "id" | "name" | "targetDate">,
  today: Date,
): NotificationCandidate | null {
  if (!goal.targetDate) return null;
  today = startOfUtcDay(today)!;
  const targetDate = startOfUtcDay(goal.targetDate)!;
  if (targetDate >= today) return null;

  return {
    type: "GOAL_DUE",
    reminderAt: null,
    timeUntilExpiry: null,
    expiryDate: targetDate,
    documentName: goal.name,
    documentType: "Goal",
    message: `${goal.name} is over its due date`,
    actionUrl: `/goals/${goal.id}`,
  };
}

/** A notification as the bell needs it: the candidate, plus who it is about and whether it has been read. */
export type DerivedNotification = NotificationCandidate & {
  /** Stable across renders, and the value the mark-read actions take. */
  key: string;
  source: NotificationSource;
  sourceId: string;
  readAt: Date | null;
  /**
   * When the bell first showed this exact notification -- not derivable from
   * the candidate alone (see `triggeredAt` below), so `toDerivedNotification`
   * cannot fill it in; `collectNotifications` (`lib/data/notification-collection.ts`)
   * attaches it afterwards, once it knows every key in this render and has
   * resolved (or recorded) each one's own `NotificationFirstSeen` row.
   */
  firstSeenAt: Date;
  /** Set for a custom item, so it wears its own module's icon and colour. */
  moduleIcon: string | null;
  moduleColor: string | null;
};

/**
 * Ordered by the deadline they are about, soonest first.
 *
 * Overdue and expired things sort to the top on their own, because their dates
 * are already behind us. The key breaks ties so the list cannot reorder itself
 * between two renders of the same data -- nothing here reads the clock.
 *
 * This is Upcoming & Due's own ordering (lib/data/upcoming.ts sorts its own,
 * separate query the identical way). The bell below no longer sorts by this
 * directly -- it wants newest-alert-on-top, not soonest-deadline-on-top -- but
 * still reaches for this exact comparator to break a tie between two things
 * that first reached the owner at the exact same instant.
 */
const byUrgency = (first: DerivedNotification, second: DerivedNotification) =>
  first.expiryDate.getTime() - second.expiryDate.getTime() || first.key.localeCompare(second.key);

/**
 * Ordered by which notification reached the owner first -- newest on top,
 * like an inbox, not soonest-deadline-first like Upcoming & Due.
 *
 * Sorts by `firstSeenAt` (`NotificationFirstSeen`, written once per itemKey
 * the moment it's first derived -- see `collectNotifications`), which is
 * deliberately *not* the deadline or reminder-window date a notification is
 * about: a document created today with only two weeks left still reached the
 * owner today, even though the calendar date its message counts down from
 * (`expiryDate − prompt`) is well in the past. This was `triggeredAt`
 * (that deadline-derived date) until it visibly put a brand-new alert at the
 * bottom of the list -- exactly this mismatch.
 *
 * `byUrgency` only breaks a tie between two notifications with the identical
 * `firstSeenAt` instant (both derived for the first time in the same
 * request); it doesn't matter which of those sorts first, so any
 * deterministic order does.
 */
const byRecency = (first: DerivedNotification, second: DerivedNotification) =>
  second.firstSeenAt.getTime() - first.firstSeenAt.getTime() || byUrgency(first, second);

/**
 * Builds a `DerivedNotification` from a candidate, if there is one -- shared
 * by `collectNotifications` (`lib/data/notification-collection.ts`), which is
 * the only caller, but kept here since it closes over nothing but its own
 * arguments and belongs next to the candidate/`DerivedNotification` shapes it
 * stitches together. `readAtFor` is a lookup rather than a value because the
 * key it must be looked up by -- record, type and deadline -- only exists
 * once the candidate itself is known to exist.
 *
 * Missing `firstSeenAt`, unlike `readAt`: resolving it means knowing every
 * key this render produced first (to batch one lookup, and one insert for
 * whichever are new, rather than a round trip per notification), which this
 * function -- building exactly one notification at a time -- cannot do.
 * `collectNotifications` attaches it afterwards, in one pass over everything
 * this returns.
 */
export function toDerivedNotification(
  source: NotificationSource,
  sourceId: string,
  candidate: NotificationCandidate | null,
  readAtFor: (key: string) => Date | null,
  module?: { icon: string; color: string },
): Omit<DerivedNotification, "firstSeenAt"> | null {
  if (!candidate) return null;
  const key = notificationKey(source, sourceId, candidate.type, candidate.expiryDate);
  return {
    ...candidate,
    key,
    source,
    sourceId,
    readAt: readAtFor(key),
    moduleIcon: module?.icon ?? null,
    moduleColor: module?.color ?? null,
  };
}

export { byRecency };
