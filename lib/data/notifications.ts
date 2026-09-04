import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { runNotificationEngine } from "@/lib/notifications/engine";
import { requireKinesisUser } from "@/lib/auth";

export async function evaluateNotifications(now = new Date()) {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results = await Promise.all(users.map(({ id }) => runNotificationEngine(id, now)));
  return results.reduce((total, result) => ({ evaluated: total.evaluated + result.evaluated, created: total.created + result.created, removed: total.removed + result.removed }), { evaluated: 0, created: 0, removed: 0 });
}

/**
 * What the bell shows, and whether it is shown at all.
 *
 * In-app notifications governs this surface and nothing else: the engine keeps
 * reconciling while it is off, so switching it back on shows the true state
 * rather than a backlog. `enabled` is returned rather than an empty list so the
 * bell can be hidden outright -- an empty one reading "You're all caught up"
 * would claim nothing is pending when things are merely being withheld.
 */
export async function getRecentNotifications(limit = 8) {
  const user = await requireKinesisUser();
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { enabled: false as const, notifications: [], unreadCount: 0 };
  await runNotificationEngine(user.id);
  // A custom item's notification is shown with its own module's icon and
  // colour, so the module is joined through rather than guessed at from the
  // action URL.
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { customItem: { select: { module: { select: { icon: true, color: true } } } } },
  });
  const notifications = rows.map(({ customItem, ...notification }) => ({
    ...notification,
    moduleIcon: customItem?.module.icon ?? null,
    moduleColor: customItem?.module.color ?? null,
  }));
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return { enabled: true as const, notifications, unreadCount };
}

export async function markNotificationRead(id: string) {
  const user = await requireKinesisUser();
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead() {
  const user = await requireKinesisUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
