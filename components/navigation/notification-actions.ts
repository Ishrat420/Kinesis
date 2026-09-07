"use server";

import { markAllNotificationsRead, markNotificationRead } from "@/lib/data/notifications";
import type { NotificationSource } from "@/lib/notifications/identity";

export async function markNotificationReadAction(key: string, source: NotificationSource, sourceId: string) {
  await markNotificationRead(key, source, sourceId);
}

export async function markAllNotificationsReadAction() {
  await markAllNotificationsRead();
}
