import "server-only";

import webpush from "web-push";
import type { PushPayload } from "./payload";

/**
 * The public half of this deployment's VAPID key pair, which a browser
 * subscribes against. Null when push isn't configured, so Settings can say so
 * instead of offering a toggle that can never work.
 */
export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function vapidDetails() {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push is not configured: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are all required.");
  }
  return { subject, publicKey, privateKey };
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/**
 * What became of one push. `gone` means the push service no longer knows the
 * device (404/410) -- it unsubscribed, was reset, or the app was removed --
 * so its subscription should be deleted rather than tried again tomorrow.
 */
export type PushOutcome = "sent" | "gone" | "failed";

/** A day, so a phone that is off overnight still gets the morning's push. */
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapidDetails(), TTL: TIME_TO_LIVE_SECONDS },
    );
    return "sent";
  } catch (failure) {
    if (failure instanceof webpush.WebPushError && (failure.statusCode === 404 || failure.statusCode === 410)) return "gone";
    console.error("Failed to send a push notification", failure);
    return "failed";
  }
}
