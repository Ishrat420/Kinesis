"use server";

import { headers } from "next/headers";
import { deletePushSubscription, hasPushSubscription, markPushedNotificationOpened, savePushSubscription } from "@/lib/data/push";

export async function savePushSubscriptionAction(subscription: unknown): Promise<{ error?: string }> {
  const userAgent = (await headers()).get("user-agent");
  return savePushSubscription(subscription, userAgent);
}

export async function deletePushSubscriptionAction(endpoint: string) {
  if (typeof endpoint !== "string") return;
  await deletePushSubscription(endpoint);
}

export async function hasPushSubscriptionAction(endpoint: string) {
  if (typeof endpoint !== "string") return false;
  return hasPushSubscription(endpoint);
}

export async function markPushOpenedAction(key: string) {
  if (typeof key !== "string") return;
  await markPushedNotificationOpened(key);
}
