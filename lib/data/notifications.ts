import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { runNotificationEngine } from "@/lib/notifications/engine";
import { requireKinesisUser } from "@/lib/auth";

export async function evaluateNotifications(now = new Date()) {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results = await Promise.all(users.map(({ id }) => runNotificationEngine(id, now)));
  return results.reduce((total, result) => ({ evaluated: total.evaluated + result.evaluated, created: total.created + result.created, removed: total.removed + result.removed }), { evaluated: 0, created: 0, removed: 0 });
}

export async function getRecentNotifications(limit = 8) {
  const user = await requireKinesisUser();
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { notifications: [], unreadCount: 0 };
  await runNotificationEngine(user.id);
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return { notifications, unreadCount };
}

export async function markNotificationRead(id: string) {
  const user = await requireKinesisUser();
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead() {
  const user = await requireKinesisUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
