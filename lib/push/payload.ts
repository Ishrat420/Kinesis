import type { DerivedNotification } from "@/lib/notifications/engine";

/**
 * The query parameter a tapped push opens Kinesis with, naming the
 * notification so the app can mark it read (see components/pwa/PwaClient.tsx).
 */
export const PUSH_OPEN_PARAM = "kinesisPush";

/** What the service worker (public/sw.js) receives and shows. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** The bell's unread count when this was sent, for the Home Screen icon's badge. */
  badge: number;
};

/**
 * Which of the bell's notifications the daily run should push (KD-053).
 *
 * The bell is the single source of truth: this only ever narrows what
 * `collectNotifications` derived, never adds to it. An item is pushed once --
 * not if it has been read in the app, and not again because it is still
 * unread. Its key changes when it goes overdue or its deadline moves, so
 * those are pushed afresh.
 */
export function selectNotificationsToPush(notifications: DerivedNotification[], pushedKeys: ReadonlySet<string>) {
  return notifications.filter((notification) => !notification.readAt && !pushedKeys.has(notification.key));
}

/**
 * The bell row, as a push: its bold first line as the title, its message as
 * the body. `tag` is the notification key, so a device replaces rather than
 * stacks a repeat of the same notification. `badge` sets the number on the
 * installed app's icon, so it's right even while the app is closed.
 */
export function toPushPayload(notification: Pick<DerivedNotification, "key" | "documentName" | "message" | "actionUrl">, unreadCount: number): PushPayload {
  return {
    title: notification.documentName,
    body: notification.message,
    url: withPushOpenParam(notification.actionUrl, notification.key),
    tag: notification.key,
    badge: unreadCount,
  };
}

function withPushOpenParam(actionUrl: string, key: string) {
  const [path, query = ""] = actionUrl.split("?");
  const params = new URLSearchParams(query);
  params.set(PUSH_OPEN_PARAM, key);
  return `${path}?${params.toString()}`;
}
