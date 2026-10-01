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
