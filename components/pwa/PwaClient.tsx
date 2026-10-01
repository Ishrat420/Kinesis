"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PUSH_OPEN_PARAM } from "@/lib/push/payload";
import { isPushSupported, registerServiceWorker, setInstallPrompt, type InstallPromptEvent } from "./browser";
import { markPushOpenedAction } from "./push-actions";

/**
 * The installable app's always-on piece (KD-053), mounted once in the app
 * shell. It renders nothing:
 *
 * - Registers the service worker on every load, so an updated public/sw.js
 *   reaches devices that already have push on.
 * - Keeps Chrome/Android's install prompt for Settings' install button.
 * - When Kinesis was opened by tapping a push, marks that notification read
 *   on the bell and takes the key back out of the address bar.
 */
export function PwaClient() {
  const router = useRouter();

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
