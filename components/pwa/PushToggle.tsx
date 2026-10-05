"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download, Smartphone } from "lucide-react";
import { CHECKBOX_INPUT_CLASS } from "@/components/custom-fields/field-styles";
import {
  getInstallPrompt,
  isIos,
  isPushSupported,
  isStandalone,
  registerServiceWorker,
  sameKey,
  setInstallPrompt,
  subscribeToInstallPrompt,
  urlBase64ToUint8Array,
} from "./browser";
import { deletePushSubscriptionAction, hasPushSubscriptionAction, savePushSubscriptionAction } from "./push-actions";

type Status = "checking" | "unconfigured" | "needs-home-screen" | "unsupported" | "blocked" | "off" | "on";

/**
 * Push on/off for this device only (KD-053). It acts straight away rather
 * than waiting for "Save settings": turning push on needs the browser's
 * permission prompt, which only appears in direct response to a tap.
 *
 * Lives inside SettingsForm's notifications section, but isn't part of that
 * form: `form=""` detaches the checkbox, so it is never submitted with it, and
 * a reset of the form can never set it back to unchecked while push stays on.
 */
export function PushToggle({ publicKey, inAppEnabled }: { publicKey: string | null; inAppEnabled: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const installPrompt = useSyncExternalStore(subscribeToInstallPrompt, getInstallPrompt, () => null);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<Status> => {
      if (!publicKey) return "unconfigured";
      if (isIos() && !isStandalone()) return "needs-home-screen";
      if (!isPushSupported()) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return "off";
      return (await hasPushSubscriptionAction(subscription.endpoint)) ? "on" : "off";
    })()
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch(() => { if (!cancelled) setStatus("off"); });
    return () => { cancelled = true; };
  }, [publicKey]);

  async function turnOn() {
    // Asked first, before anything else is awaited: browsers only show the
    // prompt from inside the tap that asked for it.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "blocked" : "off");
      return;
    }
    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(publicKey!);
    // A subscription made against another key (the keys were rotated) can't
    // be reused, and the browser refuses a second one until it's gone.
    const existing = await registration.pushManager.getSubscription();
    if (existing && !sameKey(existing.options.applicationServerKey, applicationServerKey)) await existing.unsubscribe();
    const subscription = (existing && sameKey(existing.options.applicationServerKey, applicationServerKey))
      ? existing
      : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const result = await savePushSubscriptionAction(subscription.toJSON());
    if (result.error) {
      await subscription.unsubscribe();
      throw new Error(result.error);
    }
    setStatus("on");
  }

  async function turnOff() {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await deletePushSubscriptionAction(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setStatus("off");
  }

  async function toggle(checked: boolean) {
    setBusy(true);
    setError(null);
    try {
      await (checked ? turnOn() : turnOff());
    } catch (failure) {
      console.error("Failed to change push notifications", failure);
      setError(checked ? "Couldn't turn on push notifications. Try again." : "Couldn't turn off push notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const canToggle = status === "on" || status === "off";
  const note = {
    checking: null,
    unconfigured: "Push notifications aren't set up on this deployment.",
    "needs-home-screen": "On iPhone and iPad, add Kinesis to your Home Screen first: tap Share, then Add to Home Screen, then open Kinesis from there.",
    unsupported: "This browser doesn't support push notifications.",
    blocked: "Notifications are blocked for Kinesis. Allow them in this browser's or device's settings, then come back here.",
    off: null,
    on: null,
  }[status];

  return (
    <div className="py-4">
      <label className={`flex items-center justify-between gap-5 ${canToggle ? "cursor-pointer" : ""}`}>
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100"><Smartphone className="h-4 w-4" /></span>
          <span className="text-sm">
            <span className="font-medium text-zinc-800">Push notifications on this device</span>
            <span className="mt-1 block text-zinc-500">Get each new bell notification on this device, once a day in the morning, even when Kinesis is closed.</span>
          </span>
        </span>
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          form=""
          checked={status === "on"}
          disabled={!canToggle || busy}
          onChange={(event) => toggle(event.target.checked)}
          aria-label="Push notifications on this device"
          className={CHECKBOX_INPUT_CLASS}
        />
        <Check aria-hidden="true" className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </span>
      </label>
      {note && <p className="mt-3 text-xs text-zinc-500">{note}</p>}
      {status === "on" && !inAppEnabled && <p className="mt-3 text-xs text-amber-700">In-app notifications are off, so nothing will be pushed until they&rsquo;re back on.</p>}
      {error && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      {installPrompt && (
        <button type="button" onClick={install} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium transition hover:bg-zinc-50">
          <Download className="h-3.5 w-3.5" /> Install Kinesis on this device
        </button>
      )}
    </div>
  );
}
