/**
 * Browser-side helpers for the installable app and Web Push (KD-053). Only
 * ever called from Client Components, inside effects or event handlers.
 */

export const SERVICE_WORKER_URL = "/sw.js";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPadOS reports itself as a Mac, so a touch screen is what gives it away. */
export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Opened from the Home Screen rather than in a browser tab. */
export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
}

/** This browser's push subscription, if it has one. Never prompts or registers anything. */
export async function getThisDevicesPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Ends this browser's push subscription at the push service itself, so
 * nothing more can reach it -- without needing anyone to be signed in, which
 * is what makes it usable at sign-out. Kinesis's own row for it is removed
 * by the next daily run, which deletes any device the push service reports
 * gone.
 */
export async function unsubscribeThisDevice() {
  const subscription = await getThisDevicesPushSubscription();
  if (subscription) await subscription.unsubscribe();
}

/** A VAPID public key, as the byte array `pushManager.subscribe` takes. */
export function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function sameKey(first: ArrayBuffer | null | undefined, second: Uint8Array) {
  if (!first) return false;
  const bytes = new Uint8Array(first);
  return bytes.length === second.length && bytes.every((byte, index) => byte === second[index]);
}

/**
 * Chrome and Android's install prompt. The event fires once, early in the
 * page's life, long before Settings may be open -- so PwaClient captures it
 * for the whole app and the install button reads it from here.
 */
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let installPrompt: InstallPromptEvent | null = null;
const installPromptListeners = new Set<() => void>();

export function setInstallPrompt(event: InstallPromptEvent | null) {
  installPrompt = event;
  for (const listener of installPromptListeners) listener();
}

export function getInstallPrompt() {
  return installPrompt;
}

export function subscribeToInstallPrompt(listener: () => void) {
  installPromptListeners.add(listener);
  return () => {
    installPromptListeners.delete(listener);
  };
}

/**
 * The number on the installed app's Home Screen icon (iOS 16.4+, and
 * installed apps on desktop Chrome and Edge): the bell's unread count. Where
 * the Badging API is missing, or the badge isn't allowed -- iOS shows it only
 * once notifications are permitted -- it quietly does nothing.
 */
export function setAppBadge(count: number) {
  const badging = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!badging.setAppBadge || !badging.clearAppBadge) return;
  (count > 0 ? badging.setAppBadge(count) : badging.clearAppBadge()).catch(() => {});
}
