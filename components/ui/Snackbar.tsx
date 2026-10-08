"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Z_INDEX } from "@/lib/layout/z-index";

const VISIBLE_MS = 3000;
const FADE_MS = 300;

/**
 * A brief confirmation that fades in at the bottom of the screen, stays for
 * about three seconds, fades out, then calls `onDismiss` so the caller can
 * drop it. Give it a fresh `key` per message: a remount is what restarts the
 * timer, so the same text shown twice in a row still gets its full time.
 *
 * Sits above the phone's bottom tab bar (KD-054) via the same
 * `--tab-bar-clearance` the page content already reserves, and never takes
 * pointer events, so it can't block what's underneath while it fades.
 */
export function Snackbar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [shown, setShown] = useState(false);
  // Held in a ref so a re-render of the caller (a `router.refresh()` landing
  // mid-display) never restarts the timers below.
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    const show = requestAnimationFrame(() => setShown(true));
    const hide = setTimeout(() => setShown(false), VISIBLE_MS);
    const done = setTimeout(() => dismissRef.current(), VISIBLE_MS + FADE_MS);
    return () => { cancelAnimationFrame(show); clearTimeout(hide); clearTimeout(done); };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-4 bottom-(--tab-bar-clearance) ${Z_INDEX.banner} flex justify-center transition duration-300 ease-out md:bottom-8 ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
    >
      <div className="flex max-w-full items-center gap-2.5 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-50 shadow-[0_12px_32px_rgb(0,0,0,0.18)]">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="min-w-0">{message}</span>
      </div>
    </div>
  );
}
