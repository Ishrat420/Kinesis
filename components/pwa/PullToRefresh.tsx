"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PULL_THRESHOLD, pullOffset } from "@/lib/pwa/pull-to-refresh";
import { isStandalone } from "./browser";

/** Where the spinner rests while the refresh runs. */
const REFRESHING_OFFSET = 56;

/**
 * Pull down from the top of a page to refresh it, in the installed app only:
 * a Home Screen app loses Safari's own pull-to-refresh, and in a browser tab
 * this would fight it.
 *
 * Refreshing re-fetches the page's data in place (router.refresh) rather than
 * reloading the whole app, so the tab bar, scroll and anything open stay put.
 *
 * A pull only starts at the very top of the page, moving downward, from
 * something that isn't inside a fixed layer -- the tab bar, a sheet, a dialog,
 * the notifications panel -- or a list scrolled part way down, so it never
 * steals a swipe meant for any of those.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const refreshingRef = useRef(false);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    if (!isStandalone()) return;

    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let current = 0;

    const onStart = (event: TouchEvent) => {
      start = null;
      if (event.touches.length !== 1 || window.scrollY > 0 || refreshingRef.current) return;
      if (startsInsideAnotherSurface(event.target)) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      pulling = false;
      current = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!pulling) {
        // Up, sideways, or the page has scrolled after all: not a pull.
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
          if (dy < 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) start = null;
          return;
        }
        pulling = true;
        setDragging(true);
      }
      // Holds the page still (no rubber band) while the spinner follows.
      event.preventDefault();
      current = pullOffset(dy);
      setOffset(current);
    };

    const onEnd = () => {
      if (pulling) {
        setDragging(false);
        setOffset(0);
        if (current >= PULL_THRESHOLD) startRefresh(() => router.refresh());
      }
      start = null;
      pulling = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const shown = dragging ? offset : refreshing ? REFRESHING_OFFSET : 0;
  const armed = dragging && offset >= PULL_THRESHOLD;

  return (
    // Under the top bar (z-20, below the scale's `chrome`), so the spinner
    // slides out from behind it rather than over it.
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[calc(72px+env(safe-area-inset-top))] z-20 flex justify-center">
      <div
        className={`-mt-11 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/80 bg-white shadow-[0_6px_16px_rgb(0,0,0,0.12)] ${
          dragging ? "" : "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        }`}
        style={{ transform: `translateY(${shown}px)`, opacity: Math.min(1, shown / PULL_THRESHOLD) }}
      >
        <RefreshCw
          className={`h-4 w-4 transition-colors ${armed || refreshing ? "text-zinc-900" : "text-zinc-400"} ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${shown * 3}deg)` }}
        />
      </div>
    </div>
  );
}

/**
 * A touch inside a fixed layer, inside a list already scrolled down, or on
 * something that handles its own vertical drags -- the relationship map in
 * pan mode, a dashboard card's drag handle, anything that turns off vertical
 * panning with touch-action -- isn't a page pull.
 */
function startsInsideAnotherSurface(target: EventTarget | null) {
  for (let element = target instanceof Element ? target : null; element && element !== document.body; element = element.parentElement) {
    if (element.scrollTop > 0) return true;
    const style = getComputedStyle(element);
    if (style.position === "fixed") return true;
    if (!["auto", "manipulation"].includes(style.touchAction) && !style.touchAction.includes("pan-y")) return true;
  }
  return false;
}
