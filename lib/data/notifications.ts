import { prisma } from "./prisma";
import { getSettings } from "./settings";

const DAY = 86_400_000;

function utcMidnight(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function durationUntil(days: number) {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (days >= 30 && days % 30 === 0) {
    const months = days / 30;
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export async function evaluateNotifications(now = new Date()) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { evaluated: 0, created: 0 };
  const today = utcMidnight(now);
  const documents = await prisma.document.findMany({
    where: { expiryDate: { not: null } },
  });

  let created = 0;
  for (const document of documents) {
    const expiryDate = utcMidnight(document.expiryDate!);
    const reminderAt = new Date(expiryDate.getTime() - document.prompt * DAY);
    const type = today >= expiryDate
      ? "EXPIRED" as const
      : settings.remindersEnabled && today >= reminderAt
        ? "REMINDER_DUE" as const
        : null;
    if (!type) continue;

    const timeUntilExpiry = type === "REMINDER_DUE"
      ? durationUntil(Math.max(0, Math.round((expiryDate.getTime() - today.getTime()) / DAY)))
      : null;
    const formattedExpiry = expiryDate.toLocaleDateString("en-AU", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
    const message = type === "REMINDER_DUE"
      ? `${document.name} expires in ${timeUntilExpiry}`
      : `${document.name} expired on ${formattedExpiry}`;

    const result = await prisma.notification.createMany({
      data: [{
        id: crypto.randomUUID(), type, documentId: document.id,
        reminderAt, timeUntilExpiry, expiryDate,
        documentName: document.name, documentType: document.type || null,
        message, actionUrl: `/documents/${document.id}`,
      }],
      skipDuplicates: true,
    });
    created += result.count;
  }
  return { evaluated: documents.length, created };
}

export async function getRecentNotifications(limit = 8) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { notifications: [], unreadCount: 0 };
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const unreadCount = await prisma.notification.count({ where: { readAt: null } });
  return { notifications, unreadCount };
}

export async function markNotificationRead(id: string) {
  await prisma.notification.updateMany({ where: { id }, data: { readAt: new Date() } });
}
