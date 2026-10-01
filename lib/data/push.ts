import "server-only";

import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { collectNotifications, markNotificationRead } from "./notifications";
import { notificationRecordLink, parseNotificationKey } from "@/lib/notifications/identity";
import type { DerivedNotification } from "@/lib/notifications/engine";
import { selectNotificationsToPush, toPushPayload } from "@/lib/push/payload";
import { getVapidPublicKey, sendPush } from "@/lib/push/sender";

/** The parts of a browser `PushSubscription` (its `toJSON()`) that get stored. */
export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 512;

/** The subscription a browser hands over is untrusted input; anything but the expected shape is refused. */
function parseSubscription(input: unknown): PushSubscriptionInput | null {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || !p256dh || p256dh.length > MAX_KEY_LENGTH) return null;
  if (typeof auth !== "string" || !auth || auth.length > MAX_KEY_LENGTH) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function pushedMarkers(userId: string, notifications: Pick<DerivedNotification, "key" | "source" | "sourceId">[]) {
  return notifications.map((notification) => ({
    id: crypto.randomUUID(), userId, itemKey: notification.key,
    ...notificationRecordLink(notification.source, notification.sourceId),
  }));
}

/**
 * Turns push on for this device.
 *
 * Going from no devices to one -- the first time, or again after push was
 * turned off everywhere -- first marks everything currently on the bell as
 * already pushed, so the next daily run sends only what appears from now on
 * rather than the whole backlog at once. A further device joins without that:
 * the pushed markers are per owner, so it only ever gets what's new.
 */
export async function savePushSubscription(input: unknown, userAgent: string | null) {
  const subscription = parseSubscription(input);
  if (!subscription) return { error: "This browser returned an invalid push subscription." };
  const user = await requireKinesisUser();

  const otherDevices = await prisma.webPushSubscription.count({ where: { userId: user.id, endpoint: { not: subscription.endpoint } } });
  if (otherDevices === 0) {
    const current = await collectNotifications(user.id);
    if (current.length) {
      await prisma.notificationPushed.createMany({ data: pushedMarkers(user.id, current), skipDuplicates: true });
    }
  }

  const data = {
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    userId: user.id,
  };
  await prisma.webPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { id: crypto.randomUUID(), endpoint: subscription.endpoint, ...data },
    update: data,
  });
  return {};
}

/** Turns push off for this device. */
export async function deletePushSubscription(endpoint: string) {
  const user = await requireKinesisUser();
  await prisma.webPushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
}

/**
 * Whether Kinesis still holds this device's subscription. A browser can keep
 * one Kinesis has since dropped -- the push service reported it gone, or the
 * owner deleted their data -- and that device is not actually getting pushes.
 */
export async function hasPushSubscription(endpoint: string) {
  const user = await requireKinesisUser();
  return (await prisma.webPushSubscription.count({ where: { userId: user.id, endpoint } })) > 0;
}

/** Marks read the notification a tapped push named. Anything malformed is ignored. */
export async function markPushedNotificationOpened(key: string) {
  const parsed = parseNotificationKey(key);
  if (!parsed) return;
  await markNotificationRead(key, parsed.source, parsed.sourceId);
}

export type DailyPushSummary = { configured: boolean; users: number; pushed: number; removedDevices: number };

/**
 * The daily run (KD-053): for every owner with a device, push each bell item
 * not yet pushed.
 *
 * Mirrors the bell exactly. Nothing is pushed while in-app notifications are
 * off, since the bell is hidden then, and `collectNotifications` already
 * applies every reminder setting. It is the same derivation the bell renders,
 * so the two cannot diverge.
 *
 * `collectNotifications` records `NotificationFirstSeen` for anything new, so
 * an item first derived here is stamped with this run's time rather than when
 * the owner next opens Kinesis. That only feeds the bell's newest-first
 * order, and items first seen on the same day still share a stamp, so the
 * order the owner sees is unchanged.
 *
 * An item is recorded as pushed once at least one device accepted it. If
 * every device failed, it is tried again on the next run.
 */
export async function runDailyPush(now = new Date()): Promise<DailyPushSummary> {
  if (!getVapidPublicKey() || !process.env.VAPID_PRIVATE_KEY?.trim() || !process.env.VAPID_SUBJECT?.trim()) {
    return { configured: false, users: 0, pushed: 0, removedDevices: 0 };
  }

  const owners = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: {
      id: true,
      settings: { select: { notificationsEnabled: true } },
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  const summary: DailyPushSummary = { configured: true, users: 0, pushed: 0, removedDevices: 0 };
  for (const owner of owners) {
    // No settings row yet means every default, and in-app notifications default on.
    if (owner.settings && !owner.settings.notificationsEnabled) continue;
    summary.users += 1;

    const notifications = await collectNotifications(owner.id, now);
    const keys = notifications.map((notification) => notification.key);
    const pushed = keys.length
      ? await prisma.notificationPushed.findMany({ where: { userId: owner.id, itemKey: { in: keys } }, select: { itemKey: true } })
      : [];
    // The bell lists newest first; sending oldest first leaves the newest on
    // top of the device's notification list too.
    const toPush = selectNotificationsToPush(notifications, new Set(pushed.map((row) => row.itemKey))).reverse();

    let devices = owner.pushSubscriptions;
    for (const notification of toPush) {
      if (!devices.length) break;
      const payload = toPushPayload(notification);
      const outcomes = await Promise.all(devices.map((device) => sendPush(device, payload)));

      const gone = devices.filter((_, index) => outcomes[index] === "gone");
      if (gone.length) {
        await prisma.webPushSubscription.deleteMany({ where: { id: { in: gone.map((device) => device.id) } } });
        summary.removedDevices += gone.length;
        devices = devices.filter((_, index) => outcomes[index] !== "gone");
      }

      if (outcomes.includes("sent")) {
        // Recorded one at a time rather than after the loop, so a run cut
        // short part way through doesn't resend what it already delivered.
        await prisma.notificationPushed.createMany({ data: pushedMarkers(owner.id, [notification]), skipDuplicates: true });
        summary.pushed += 1;
      }
    }
  }
  return summary;
}
