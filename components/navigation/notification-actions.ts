"use server";

import { markAllNotificationsRead, markNotificationRead } from "@/lib/data/notifications";

export async function markNotificationReadAction(id: string) {
  await markNotificationRead(id);
}

export async function markAllNotificationsReadAction() {
  await markAllNotificationsRead();
}
