import type { CustomItem, Document, Milestone, RelationshipImportantDate, Todo, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { addUtcDays, differenceInCalendarDays, formatDate, formatDeadline, formatFutureDate, formatCalendarDuration, startOfDayIn, startOfUtcDay, DAY_COUNT_DISPLAY_LIMIT_DAYS } from "@/lib/dates";
import { resolveFormatPreferences } from "@/lib/format/preferences";
import { getReminderLeadDays, getReminderWindowStart } from "@/lib/reminders/policy";
import { activeGoalWhere } from "@/lib/goals/active";
import { notificationKey, type NotificationSource } from "./identity";
import { archiveLapsedGoals } from "@/lib/data/goal-status";
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

/** Opens a reminder `leadDays` before the due date and keeps it current while the milestone is overdue. */
export function getMilestoneNotificationCandidate(
  milestone: Pick<Milestone, "id" | "name" | "dueDate"> & { goal: { id: string; name: string } },
  today: Date,
  leadDays = 0,
): NotificationCandidate | null {
  if (!milestone.dueDate) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(milestone.dueDate)!;
  const reminderAt = getReminderWindowStart(dueDate, leadDays);
  if (today < reminderAt) return null;

  return {
    type: today < dueDate ? "REMINDER_DUE" : "MILESTONE_DUE",
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
 */
export function getCustomItemNotificationCandidate(
  item: Pick<CustomItem, "id" | "name" | "dueDate" | "moduleId">,
  today: Date,
  leadDays = 0,
  locale?: string,
): NotificationCandidate | null {
  if (!item.dueDate) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(item.dueDate)!;
  const reminderAt = getReminderWindowStart(dueDate, leadDays);
  if (today < reminderAt) return null;

  const dueSoon = today < dueDate;
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
 * Opens on the due date itself and stays current while the To-Do is overdue.
 *
 * Unlike every other source there is no lead time to honour: a To-Do has no
 * advance stage at all (ADR-009 is explicit that capture must not require a
 * deadline, so most of them never have a date to look ahead from). It speaks on
 * the day and not before, which also means it is never an *advance* notice --
 * so, like an expired document, it is not gated on `remindersEnabled`. Turning
 * reminders off silences predictions, not statements about what has already
 * come due.
 */
export function getTodoNotificationCandidate(
  todo: Pick<Todo, "id" | "name" | "dueDate" | "status">,
  today: Date,
): NotificationCandidate | null {
  if (!todo.dueDate || !isOpenTodoStatus(todo.status)) return null;
  today = startOfUtcDay(today)!;
  const dueDate = startOfUtcDay(todo.dueDate)!;
  if (today < dueDate) return null;

  return {
    type: "TODO_DUE",
    reminderAt: dueDate,
    timeUntilExpiry: null,
    expiryDate: dueDate,
    documentName: todo.name,
    documentType: "To-do",
    message: `${todo.name} is ${formatDeadline(dueDate, today)}`,
    actionUrl: "/todos",
  };
}

/** A notification as the bell needs it: the candidate, plus who it is about and whether it has been read. */
export type DerivedNotification = NotificationCandidate & {
  /** Stable across renders, and the value the mark-read actions take. */
  key: string;
  source: NotificationSource;
  sourceId: string;
  readAt: Date | null;
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
 */
const byUrgency = (first: DerivedNotification, second: DerivedNotification) =>
  first.expiryDate.getTime() - second.expiryDate.getTime() || first.key.localeCompare(second.key);

/**
 * Every notification the owner should currently see, computed rather than stored.
 *
 * This used to be a reconcile pass that deleted and re-inserted rows for every
 * record on every page render. Nothing is written here at all: the candidates
 * are a pure function of the records, the day and the settings, and the only
 * thing read from the database that is not derivable is which of them have
 * already been read.
 *
 * The queries are narrowed to records that could actually produce a candidate.
 * That is only possible because nothing needs cleaning up any more -- the old
 * pass had to load every To-Do, dated or not, purely so it could reconcile away
 * a row for one whose date had been cleared.
 */
export async function collectNotifications(userId: string, now = new Date()): Promise<DerivedNotification[]> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const remindersEnabled = settings?.remindersEnabled ?? true;
  const milestoneLeadDays = getReminderLeadDays(settings, "milestone");
  const relationshipLeadDays = getReminderLeadDays(settings, "relationship");
  const customItemLeadDays = getReminderLeadDays(settings, "customItem");
  const { locale, timeZone } = resolveFormatPreferences(settings);
  const today = startOfDayIn(timeZone, now);

  const [documents, milestones, relationshipDates, customItems, todos, reads] = await Promise.all([
    // A document's reminder opens up to a calendar year before it expires, so
    // that is the bound. The exact prompt is per-record and calendar-based, so
    // the last word stays with the candidate itself.
    prisma.document.findMany({
      where: { userId, archived: false, expiryDate: { not: null, lte: addUtcDays(today, 366) } },
    }),
    prisma.milestone.findMany({
      where: {
        completed: false,
        dueDate: { not: null, lte: addUtcDays(today, milestoneLeadDays) },
        goal: { userId, ...activeGoalWhere(today) },
      },
      include: { goal: { select: { id: true, name: true } } },
    }),
    // Not narrowed: a yearly date rolls forward to its next occurrence, so the
    // stored date says little about when it next speaks. The set is one row per
    // birthday or anniversary, which is small by nature.
    prisma.relationshipImportantDate.findMany({
      where: { OR: [{ relationship: { userId } }, { selfPerson: { userId } }] },
      include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true },
    }),
    prisma.customItem.findMany({
      where: { archived: false, dueDate: { not: null, lte: addUtcDays(today, customItemLeadDays) }, module: { userId } },
      include: { module: { select: { icon: true, color: true } } },
    }),
    // A To-Do has no advance stage at all, so it can only speak from its due
    // date onwards -- and only while it is still open.
    prisma.todo.findMany({
      where: { userId, dueDate: { not: null, lte: today } },
      select: { id: true, name: true, dueDate: true, status: true },
    }),
    prisma.notificationRead.findMany({ where: { userId }, select: { itemKey: true, readAt: true } }),
  ]);

  const readAtByKey = new Map(reads.map((read) => [read.itemKey, read.readAt]));
  const derived: DerivedNotification[] = [];
  const add = (
    source: NotificationSource,
    sourceId: string,
    candidate: NotificationCandidate | null,
    module?: { icon: string; color: string },
  ) => {
    if (!candidate) return;
    const key = notificationKey(source, sourceId, candidate.type, candidate.expiryDate);
    derived.push({
      ...candidate, key, source, sourceId,
      readAt: readAtByKey.get(key) ?? null,
      moduleIcon: module?.icon ?? null,
      moduleColor: module?.color ?? null,
    });
  };

  for (const document of documents) {
    add("document", document.id, getDocumentNotificationCandidate(document, today, remindersEnabled, locale));
  }
  for (const milestone of milestones) {
    add("milestone", milestone.id, remindersEnabled ? getMilestoneNotificationCandidate(milestone, today, milestoneLeadDays) : null);
  }
  for (const importantDate of relationshipDates) {
    const personName = importantDate.relationship
      ? (importantDate.relationship.firstPerson.isSelf ? importantDate.relationship.secondPerson.name : importantDate.relationship.firstPerson.name)
      : importantDate.selfPerson!.name;
    add("relationship", importantDate.id, remindersEnabled
      ? getRelationshipDateNotificationCandidate({ ...importantDate, personName }, today, relationshipLeadDays)
      : null);
  }
  for (const item of customItems) {
    add("custom", item.id, remindersEnabled ? getCustomItemNotificationCandidate(item, today, customItemLeadDays, locale) : null, item.module);
  }
  for (const todo of todos) {
    add("todo", todo.id, getTodoNotificationCandidate(todo, today));
  }

  return derived.sort(byUrgency);
}

/**
 * The daily pass, which no longer has notifications to write.
 *
 * What is left is the one genuine write: a goal past its target date is
 * archived, so its own status chip converges without anyone having to open the
 * goals page. Everything else the cron used to do is now answered on read.
 */
export async function runDailyMaintenance(userId: string, now = new Date()) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { timeZone: true } });
  const { timeZone } = resolveFormatPreferences(settings);
  const { count } = await archiveLapsedGoals(userId, startOfDayIn(timeZone, now));
  return { goalsArchived: count };
}
