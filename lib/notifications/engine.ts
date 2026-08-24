import type { Document, Milestone, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";
import { getSettings } from "@/lib/data/settings";

const DAY = 86_400_000;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatRemainingTime(days: number) {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

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
): NotificationCandidate | null {
  if (!document.expiryDate) return null;

  const today = startOfUtcDay(now);
  const expiryDate = startOfUtcDay(document.expiryDate);
  const reminderAt = new Date(expiryDate.getTime() - document.prompt * DAY);
  const daysRemaining = Math.max(0, Math.round((expiryDate.getTime() - today.getTime()) / DAY));
  // A document remains valid for its full expiry date; it is expired the following day.
  const type = today > expiryDate
    ? "EXPIRED"
    : remindersEnabled && today >= reminderAt
      ? "REMINDER_DUE"
      : null;

  if (!type) return null;
  const timeUntilExpiry = type === "REMINDER_DUE" ? formatRemainingTime(daysRemaining) : null;

  return {
    type,
    reminderAt,
    timeUntilExpiry,
    expiryDate,
    documentName: document.name,
    documentType: document.type || null,
    message: type === "REMINDER_DUE"
      ? daysRemaining === 0 ? `${document.name} expires today` : `${document.name} expires in ${timeUntilExpiry}`
      : `${document.name} expired on ${formatDate(expiryDate)}`,
    actionUrl: `/documents/${document.id}`,
  };
}

/** Creates an alert on the due date and keeps it current while the milestone is overdue. */
export function getMilestoneNotificationCandidate(
  milestone: Pick<Milestone, "id" | "name" | "dueDate"> & { goal: { id: string; name: string } },
  now = new Date(),
): NotificationCandidate | null {
  if (!milestone.dueDate) return null;
  const today = startOfUtcDay(now);
  const dueDate = startOfUtcDay(milestone.dueDate);
  if (today < dueDate) return null;

  const daysOverdue = Math.round((today.getTime() - dueDate.getTime()) / DAY);
  return {
    type: "MILESTONE_DUE",
    reminderAt: dueDate,
    timeUntilExpiry: null,
    expiryDate: dueDate,
    documentName: milestone.name,
    documentType: `Milestone · ${milestone.goal.name}`,
    message: daysOverdue === 0
      ? `${milestone.name} is due today`
      : `${milestone.name} was due ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} ago`,
    actionUrl: `/goals/${milestone.goal.id}`,
  };
}

async function reconcileDocument(document: Document, now: Date, remindersEnabled: boolean) {
  const candidate = getDocumentNotificationCandidate(document, now, remindersEnabled);
  const stale = await prisma.notification.deleteMany({
    where: candidate
      ? { documentId: document.id, NOT: { type: candidate.type, expiryDate: candidate.expiryDate } }
      : { documentId: document.id },
  });
  if (!candidate) return { created: 0, removed: stale.count };

  const inserted = await prisma.notification.createMany({
    data: [{ id: crypto.randomUUID(), documentId: document.id, ...candidate }],
    skipDuplicates: true,
  });
  if (!inserted.count) {
    await prisma.notification.updateMany({
      where: { documentId: document.id, type: candidate.type, expiryDate: candidate.expiryDate },
      data: candidate,
    });
  }
  return { created: inserted.count, removed: stale.count };
}

async function reconcileMilestone(
  milestone: Pick<Milestone, "id" | "name" | "dueDate"> & { goal: { id: string; name: string } },
  now: Date,
  remindersEnabled: boolean,
) {
  const candidate = remindersEnabled ? getMilestoneNotificationCandidate(milestone, now) : null;
  const stale = await prisma.notification.deleteMany({
    where: candidate
      ? { milestoneId: milestone.id, NOT: { type: candidate.type, expiryDate: candidate.expiryDate } }
      : { milestoneId: milestone.id },
  });
  if (!candidate) return { created: 0, removed: stale.count };

  const inserted = await prisma.notification.createMany({
    data: [{ id: crypto.randomUUID(), milestoneId: milestone.id, ...candidate }],
    skipDuplicates: true,
  });
  if (!inserted.count) {
    await prisma.notification.updateMany({
      where: { milestoneId: milestone.id, type: candidate.type, expiryDate: candidate.expiryDate },
      data: candidate,
    });
  }
  return { created: inserted.count, removed: stale.count };
}

/** Reconciles every supported source so normal page loads and the cron are equally reliable. */
export async function runNotificationEngine(now = new Date()) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { evaluated: 0, created: 0, removed: 0 };

  const [documents, milestones, orphanCleanup] = await Promise.all([
    prisma.document.findMany(),
    prisma.milestone.findMany({
      where: { completed: false, goal: { status: "Active" } },
      include: { goal: { select: { id: true, name: true } } },
    }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { documentId: null, milestoneId: null },
          { milestoneId: { not: null }, milestone: { is: { OR: [{ completed: true }, { goal: { status: { not: "Active" } } }] } } },
        ],
      },
    }),
  ]);

  const results = await Promise.all([
    ...documents.map((document) => reconcileDocument(document, now, settings.remindersEnabled)),
    ...milestones.map((milestone) => reconcileMilestone(milestone, now, settings.remindersEnabled)),
  ]);
  return results.reduce(
    (total, result) => ({
      evaluated: documents.length + milestones.length,
      created: total.created + result.created,
      removed: total.removed + result.removed,
    }),
    { evaluated: documents.length + milestones.length, created: 0, removed: orphanCleanup.count } as { evaluated: number; created: number; removed: number },
  );
}
