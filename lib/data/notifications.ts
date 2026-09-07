import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { collectNotifications, runDailyMaintenance, type DerivedNotification } from "@/lib/notifications/engine";
import { NOTIFICATION_LINK_FIELD, type NotificationSource } from "@/lib/notifications/identity";
import { requireKinesisUser } from "@/lib/auth";

/** The daily cron: goals that have lapsed are archived, and nothing else is written. */
export async function evaluateNotifications(now = new Date()) {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results = await Promise.all(users.map(({ id }) => runDailyMaintenance(id, now)));
  return { goalsArchived: results.reduce((total, result) => total + result.goalsArchived, 0) };
}

/**
 * What the bell shows, and whether it is shown at all.
 *
 * In-app notifications governs this surface and nothing else. Turning it off
 * hides the bell rather than emptying it: an empty one reading "You're all
 * caught up" would claim nothing is pending when things are merely being
 * withheld.
 *
 * `enabled` is returned rather than an empty list so the bell can be hidden
 * outright.
 */
export async function getRecentNotifications(limit = 8) {
  const user = await requireKinesisUser();
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { enabled: false as const, notifications: [], unreadCount: 0 };

  const notifications = await collectNotifications(user.id);
  // Counted across everything, then sliced. The badge speaks for the whole set
  // while the panel shows only the most urgent few, so counting the slice would
  // quietly under-report the moment there were more than `limit` of them.
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  return { enabled: true as const, notifications: notifications.slice(0, limit), unreadCount };
}

/** The columns that tie a read marker to its record, so deleting the record clears it. */
const linkFor = (source: NotificationSource, sourceId: string) => ({ [NOTIFICATION_LINK_FIELD[source]]: sourceId });

/**
 * Whether a record named by the browser is actually the owner's.
 *
 * The bell hands back whatever it was rendered with, so the record a mark-read
 * names is untrusted input. Without this a marker could be written against
 * someone else's row -- inert, since it could never match anything the owner's
 * own bell derives, but a foreign key pointing across accounts all the same.
 * One indexed lookup, and only when something is clicked.
 */
async function ownsRecord(userId: string, source: NotificationSource, sourceId: string) {
  const owned = { document: () => prisma.document.count({ where: { id: sourceId, userId } }),
    milestone: () => prisma.milestone.count({ where: { id: sourceId, goal: { userId } } }),
    relationship: () => prisma.relationshipImportantDate.count({ where: { id: sourceId, OR: [{ relationship: { userId } }, { selfPerson: { userId } }] } }),
    custom: () => prisma.customItem.count({ where: { id: sourceId, module: { userId } } }),
    todo: () => prisma.todo.count({ where: { id: sourceId, userId } }) }[source];
  return (await owned()) > 0;
}

/**
 * Records that a notification has been read.
 *
 * Idempotent, and safe to call for something that has since stopped being
 * shown: the marker is keyed on the notification's own identity, so a stale
 * one simply never matches again and is swept up by the record's cascade when
 * the record itself goes.
 */
export async function markNotificationRead(key: string, source: NotificationSource, sourceId: string) {
  const user = await requireKinesisUser();
  if (!(await ownsRecord(user.id, source, sourceId))) return;
  await prisma.notificationRead.upsert({
    where: { userId_itemKey: { userId: user.id, itemKey: key } },
    update: {},
    create: { id: crypto.randomUUID(), userId: user.id, itemKey: key, ...linkFor(source, sourceId) },
  });
}

/** Marks everything currently unread as read, in one statement. */
export async function markAllNotificationsRead() {
  const user = await requireKinesisUser();
  const unread = (await collectNotifications(user.id)).filter((notification) => !notification.readAt);
  if (!unread.length) return;
  await prisma.notificationRead.createMany({
    data: unread.map((notification) => ({
      id: crypto.randomUUID(), userId: user.id, itemKey: notification.key,
      ...linkFor(notification.source, notification.sourceId),
    })),
    skipDuplicates: true,
  });
}

export type { DerivedNotification };
