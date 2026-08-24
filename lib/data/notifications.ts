import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { runNotificationEngine } from "@/lib/notifications/engine";

export async function evaluateNotifications(now = new Date()) {
  return runNotificationEngine(now);
}

export async function getRecentNotifications(limit = 8) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { notifications: [], unreadCount: 0 };
  await runNotificationEngine();
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

export async function markAllNotificationsRead() {
  await prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
}
