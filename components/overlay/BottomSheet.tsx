"use client";

import { useEffect, useRef, useState } from "react";
import { Z_INDEX } from "@/lib/layout/z-index";

/** iOS's own sheet curve: quick to start, long soft landing. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/** How far, or how fast (px/ms), a swipe has to go before the sheet closes. */
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.5;

/**
 * A phone bottom sheet (KD-054's More sheet, shared since KD-045 reuses it
 * for the dashboard's Add a module list). Slides up from the bottom; closes
 * on a swipe down, a tap outside it, Escape, or picking something in it.
 * Phone only: from `md` it never renders.
 *
 * Always mounted and only moved off-screen, so it can slide out as smoothly
 * as it slid in -- and so a dialog opened from inside it (Add module) keeps
 * its state after the sheet has closed behind it. `inert` keeps the hidden
 * sheet out of the tab order and away from screen readers.
 */
export function BottomSheet({ open, onClose, ariaLabel, children }: { open: boolean; onClose: () => void; ariaLabel: string; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  /**
   * Swipe down to close. Native listeners, because the move has to be able to
   * preventDefault -- React's touch listeners are passive -- and only once the
   * list is scrolled to its top, so a swipe inside a long list still scrolls
   * it rather than dragging the sheet.
   */
  useEffect(() => {
    const panel = panelRef.current;
    const scroller = scrollRef.current;
    if (!panel || !scroller) return;

    let start: { y: number; t: number } | null = null;
    let dragging = false;
    let offset = 0;
    let velocity = 0;
    let last = { y: 0, t: 0 };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { start = null; return; }
      const y = event.touches[0].clientY;
      start = { y, t: event.timeStamp };
      last = { y, t: event.timeStamp };
      dragging = false;
      offset = 0;
      velocity = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const y = event.touches[0].clientY;
      const dy = y - start.y;
      if (!dragging) {
        if (dy <= 0 || scroller.scrollTop > 0) { if (dy < 0 || scroller.scrollTop > 0) start = null; return; }
        dragging = true;
      }
      event.preventDefault();
      offset = Math.max(0, dy);
      const dt = event.timeStamp - last.t;
      if (dt > 0) velocity = (y - last.y) / dt;
      last = { y, t: event.timeStamp };
      setDrag(offset);
    };

    const onEnd = () => {
      if (dragging && (offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY)) onCloseRef.current();
      start = null;
      dragging = false;
      setDrag(0);
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div inert={!open} className={`fixed inset-0 ${Z_INDEX.overlay} md:hidden ${open ? "" : "pointer-events-none"}`}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 touch-none bg-zinc-950/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgb(0,0,0,0.12)] outline-none ${
          drag ? "" : `transition-[transform,visibility] duration-[420ms] ${EASE} motion-reduce:transition-none`
        } ${open ? "visible" : "invisible"}`}
        style={{ transform: open ? `translateY(${drag}px)` : "translateY(100%)" }}
      >
        <div aria-hidden="true" className="mx-auto mb-3 mt-2.5 h-[5px] w-9 shrink-0 rounded-full bg-zinc-300" />

        {/*
          Closes the moment a link -- or a control marked data-sheet-dismiss --
          is tapped, so the next page's loading state shows straight away
          instead of behind the sheet. onClick, not onClickCapture: closing in
          the capture phase would beat Next's own Link handler and fall back
          to a full reload (see the history of MobileNavDrawer).
        */}
        <div
          ref={scrollRef}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = event.target as HTMLElement;
            if (!event.currentTarget.contains(target)) return;
            if (target.closest("a[href], [data-sheet-dismiss]")) onClose();
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
