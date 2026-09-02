import type { Document, Milestone, RelationshipImportantDate, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { differenceInCalendarDays, formatDate, formatDeadline, formatFutureDate, formatCalendarDuration, startOfUtcDay, DAY_COUNT_DISPLAY_LIMIT_DAYS } from "@/lib/dates";
import { resolveFormatPreferences } from "@/lib/format/preferences";
import { getReminderLeadDays, getReminderWindowStart } from "@/lib/reminders/policy";
import { getNextOccurrence, possessiveName } from "@/lib/relationships/occurrence";

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
  now = new Date(),
  remindersEnabled = true,
  locale?: string,
): NotificationCandidate | null {
  if (!document.expiryDate) return null;

  const today = startOfUtcDay(now)!;
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
  now = new Date(),
  leadDays = 0,
): NotificationCandidate | null {
  if (!milestone.dueDate) return null;
  const today = startOfUtcDay(now)!;
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
  now = new Date(),
  leadDays = 0,
): NotificationCandidate | null {
  const today = startOfUtcDay(now)!;
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

async function reconcileDocument(document: Document, userId: string, now: Date, remindersEnabled: boolean, locale: string) {
  const candidate = getDocumentNotificationCandidate(document, now, remindersEnabled, locale);
  const stale = await prisma.notification.deleteMany({
    where: candidate
      ? { userId, documentId: document.id, NOT: { type: candidate.type, expiryDate: candidate.expiryDate } }
      : { userId, documentId: document.id },
  });
  if (!candidate) return { created: 0, removed: stale.count };

  const inserted = await prisma.notification.createMany({
    data: [{ id: crypto.randomUUID(), userId, documentId: document.id, ...candidate }],
    skipDuplicates: true,
  });
  if (!inserted.count) {
    await prisma.notification.updateMany({
      where: { userId, documentId: document.id, type: candidate.type, expiryDate: candidate.expiryDate },
      data: candidate,
    });
  }
  return { created: inserted.count, removed: stale.count };
}

async function reconcileMilestone(
  milestone: Pick<Milestone, "id" | "name" | "dueDate"> & { goal: { id: string; name: string } },
  userId: string,
  now: Date,
  remindersEnabled: boolean,
  leadDays: number,
) {
  const candidate = remindersEnabled ? getMilestoneNotificationCandidate(milestone, now, leadDays) : null;
  const stale = await prisma.notification.deleteMany({
    where: candidate
      ? { userId, milestoneId: milestone.id, NOT: { type: candidate.type, expiryDate: candidate.expiryDate } }
      : { userId, milestoneId: milestone.id },
  });
  if (!candidate) return { created: 0, removed: stale.count };

  const inserted = await prisma.notification.createMany({
    data: [{ id: crypto.randomUUID(), userId, milestoneId: milestone.id, ...candidate }],
    skipDuplicates: true,
  });
  if (!inserted.count) {
    await prisma.notification.updateMany({
      where: { userId, milestoneId: milestone.id, type: candidate.type, expiryDate: candidate.expiryDate },
      data: candidate,
    });
  }
  return { created: inserted.count, removed: stale.count };
}

async function reconcileRelationshipDate(
  importantDate: Pick<RelationshipImportantDate, "id" | "label" | "date" | "repeatsYearly"> & { personName: string },
  userId: string,
  now: Date,
  remindersEnabled: boolean,
  leadDays: number,
) {
  const candidate = remindersEnabled ? getRelationshipDateNotificationCandidate(importantDate, now, leadDays) : null;
  const stale = await prisma.notification.deleteMany({
    where: candidate
      ? { userId, relationshipDateId: importantDate.id, NOT: { type: candidate.type, expiryDate: candidate.expiryDate } }
      : { userId, relationshipDateId: importantDate.id },
  });
  if (!candidate) return { created: 0, removed: stale.count };

  const inserted = await prisma.notification.createMany({
    data: [{ id: crypto.randomUUID(), userId, relationshipDateId: importantDate.id, ...candidate }],
    skipDuplicates: true,
  });
  if (!inserted.count) {
    await prisma.notification.updateMany({
      where: { userId, relationshipDateId: importantDate.id, type: candidate.type, expiryDate: candidate.expiryDate },
      data: candidate,
    });
  }
  return { created: inserted.count, removed: stale.count };
}

/** Reconciles every supported source so normal page loads and the cron are equally reliable. */
export async function runNotificationEngine(userId: string, now = new Date()): Promise<{ evaluated: number; created: number; removed: number }> {
  // The cron evaluates every user in one process, so the locale is read per
  // user here rather than from a request-scoped context.
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const notificationsEnabled = settings?.notificationsEnabled ?? true;
  const remindersEnabled = settings?.remindersEnabled ?? true;
  const milestoneLeadDays = getReminderLeadDays(settings, "milestone");
  const relationshipLeadDays = getReminderLeadDays(settings, "relationship");
  const { locale } = resolveFormatPreferences(settings);
  if (!notificationsEnabled) return { evaluated: 0, created: 0, removed: 0 };

  const [documents, milestones, relationshipDates, orphanCleanup] = await Promise.all([
    prisma.document.findMany({ where: { userId } }),
    prisma.milestone.findMany({
      where: { completed: false, goal: { userId, status: "Active" } },
      include: { goal: { select: { id: true, name: true } } },
    }),
    prisma.relationshipImportantDate.findMany({
      where: { OR: [{ relationship: { userId } }, { selfPerson: { userId } }] },
      include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true },
    }),
    prisma.notification.deleteMany({
      where: {
        userId,
        OR: [
          { documentId: null, milestoneId: null, relationshipDateId: null },
          { milestoneId: { not: null }, milestone: { is: { OR: [{ completed: true }, { goal: { status: { not: "Active" } } }] } } },
        ],
      },
    }),
  ]);

  // A person is never soft-deleted, so unlike a milestone's completed/archived
  // goal there is no "still exists but should no longer remind" state to filter
  // here: the FK cascade above already removes a Notification the moment its
  // RelationshipImportantDate (or the relationship/person behind it) is gone.
  const relationshipDateInputs = relationshipDates.map((importantDate) => ({
    id: importantDate.id,
    label: importantDate.label,
    date: importantDate.date,
    repeatsYearly: importantDate.repeatsYearly,
    personName: importantDate.relationship
      ? (importantDate.relationship.firstPerson.isSelf ? importantDate.relationship.secondPerson.name : importantDate.relationship.firstPerson.name)
      : importantDate.selfPerson!.name,
  }));

  const results = await Promise.all([
    ...documents.map((document) => reconcileDocument(document, userId, now, remindersEnabled, locale)),
    ...milestones.map((milestone) => reconcileMilestone(milestone, userId, now, remindersEnabled, milestoneLeadDays)),
    ...relationshipDateInputs.map((importantDate) => reconcileRelationshipDate(importantDate, userId, now, remindersEnabled, relationshipLeadDays)),
  ]);
  return {
    evaluated: documents.length + milestones.length + relationshipDateInputs.length,
    created: results.reduce((total, result) => total + result.created, 0),
    removed: orphanCleanup.count + results.reduce((total, result) => total + result.removed, 0),
  };
}
