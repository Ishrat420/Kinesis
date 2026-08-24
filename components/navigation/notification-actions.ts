"use server";

import { markNotificationRead } from "@/lib/data/notifications";

export async function markNotificationReadAction(id: string) {
  await markNotificationRead(id);
}
