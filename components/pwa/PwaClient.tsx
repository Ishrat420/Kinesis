"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { PUSH_OPEN_PARAM } from "@/lib/push/payload";
import { getThisDevicesPushSubscription, isPushSupported, registerServiceWorker, setInstallPrompt, unsubscribeThisDevice, type InstallPromptEvent } from "./browser";
import { hasPushSubscriptionAction, markPushOpenedAction } from "./push-actions";

/**
 * The installable app's always-on piece (KD-053), mounted once in the app
 * shell. It renders nothing:
 *
 * - Registers the service worker on every load, so an updated public/sw.js
 *   reaches devices that already have push on.
 * - Keeps Chrome/Android's install prompt for Settings' install button.
 * - When Kinesis was opened by tapping a push, marks that notification read
 *   on the bell and takes the key back out of the address bar.
 * - Keeps a shared device from carrying someone else's notifications: see
 *   the two push-ownership effects below.
 */
export function PwaClient() {
  const router = useRouter();
  const clerk = useClerk();

  // Signing out -- from the account menu, an expired session, or being
  // signed out elsewhere -- unsubscribes this browser from push, so the next
  // person to use the device never receives the previous one's
  // notifications. Only a signed-in -> signed-out change counts; the first
  // emission just records where things started.
  useEffect(() => {
    let signedIn: boolean | null = null;
    return clerk.addListener(({ session }) => {
      const now = Boolean(session);
      if (signedIn && !now) unsubscribeThisDevice().catch((failure) => console.error("Failed to unsubscribe this device from push at sign-out", failure));
      signedIn = now;
    });
  }, [clerk]);

  // The backstop for a sign-out this tab never saw (the app was closed when
  // the session ended): a push subscription in this browser that the person
  // now signed in doesn't own is someone else's, or a dead one, and is dropped.
  useEffect(() => {
    (async () => {
      const subscription = await getThisDevicesPushSubscription();
      if (subscription && !(await hasPushSubscriptionAction(subscription.endpoint))) await subscription.unsubscribe();
    })().catch((failure) => console.error("Failed to check this device's push subscription", failure));
  }, []);

  useEffect(() => {
    if (isPushSupported()) registerServiceWorker().catch((failure) => console.error("Failed to register the service worker", failure));

    const keepInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const forgetInstallPrompt = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", keepInstallPrompt);
    window.addEventListener("appinstalled", forgetInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", keepInstallPrompt);
      window.removeEventListener("appinstalled", forgetInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const key = url.searchParams.get(PUSH_OPEN_PARAM);
    if (!key) return;
    url.searchParams.delete(PUSH_OPEN_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    markPushOpenedAction(key)
      .then(() => router.refresh())
      .catch((failure) => console.error("Failed to mark the opened notification read", failure));
  }, [router]);

  return null;
}
