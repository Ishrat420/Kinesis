"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, House, LayoutGrid, ListTodo, Plus, type LucideIcon } from "lucide-react";
import { requestCaptureFocus } from "@/lib/capture/focus";
import { Z_INDEX } from "@/lib/layout/z-index";
import { tabForPath, tabSlot, type TabId } from "@/lib/navigation/tab-bar";

/** iOS's own sheet curve: quick to start, long soft landing. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/** How far, or how fast (px/ms), a swipe has to go before the sheet closes. */
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.5;

/**
 * The phone navigation (KD-054): a floating pill of tabs along the bottom,
 * where a thumb already is, with a More sheet for everything else. From `md`
 * the sidebar takes over and none of this renders.
 *
 * `children` is the More sheet's list -- the sidebar's own navigation, so the
 * two can't drift apart.
 *
 * The current tab moves the moment it's tapped rather than when the next page
 * has rendered: the highlight glides across at once, which is the feedback
 * that the tap landed. Remembering which route the tap was made on lets the
 * route change take over again without an effect, the same way the sheet's
 * open state is kept.
 */
export function MobileTabBar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tapped, setTapped] = useState<{ tab: TabId; on: string } | null>(null);
  // Forgotten as soon as the route changes, so it can't come back to life on
  // a later visit to the same page: tap To-dos on Home, then come back to
  // Home with the top bar's back, and To-dos would still have been current.
  const [route, setRoute] = useState(pathname);
  if (route !== pathname) {
    setRoute(pathname);
    setTapped(null);
  }
  const [moreOpenedOn, setMoreOpenedOn] = useState<string | null>(null);
  const moreOpen = moreOpenedOn !== null && moreOpenedOn === pathname;
  const closeMore = () => setMoreOpenedOn(null);

  const current: TabId = moreOpen ? "more" : tapped && tapped.on === pathname ? tapped.tab : tabForPath(pathname);
  const select = (tab: TabId) => setTapped({ tab, on: pathname });

  return (
    <>
      <nav
        aria-label="Tabs"
        data-tab-bar
        className={`fixed inset-x-4 bottom-(--tab-bar-offset) ${Z_INDEX.chrome} md:hidden`}
      >
        <div className="relative grid h-(--tab-bar-height) grid-cols-5 items-center rounded-[34px] border border-zinc-200/90 bg-white/75 p-1.5 shadow-[0_12px_32px_rgb(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-[1.8]">
          <span
            aria-hidden="true"
            className={`absolute left-1.5 top-1.5 h-14 w-[calc((100%-12px)/5)] rounded-[28px] bg-zinc-950/[0.07] transition-transform duration-[380ms] ${EASE} motion-reduce:transition-none`}
            style={{ transform: `translateX(${tabSlot(current) * 100}%)` }}
          />

          <TabLink href="/" label="Home" icon={House} active={current === "home"} onSelect={() => select("home")} />
          <TabLink href="/todos" label="To-dos" icon={ListTodo} active={current === "todos"} onSelect={() => select("todos")} />

          <div className="relative flex h-14 items-center justify-center">
            <button
              type="button"
              aria-label="Quick capture"
              onClick={() => { closeMore(); requestCaptureFocus(); }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-white shadow-[0_6px_16px_rgb(0,0,0,0.22)]"
            >
              <Plus className="h-[22px] w-[22px]" strokeWidth={2.25} />
            </button>
          </div>

          <TabLink href="/calendar" label="Calendar" icon={Calendar} active={current === "calendar"} onSelect={() => select("calendar")} />

          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => (moreOpen ? closeMore() : setMoreOpenedOn(pathname))}
            className={tabClassName(current === "more")}
          >
            <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={current === "more" ? 2.25 : 1.75} />
            More
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={closeMore}>{children}</MoreSheet>
    </>
  );
}

function tabClassName(active: boolean) {
  return `relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors duration-200 ${
    active ? "font-semibold text-zinc-950" : "font-medium text-zinc-500"
  }`;
}

function TabLink({ href, label, icon: Icon, active, onSelect }: { href: string; label: string; icon: LucideIcon; active: boolean; onSelect: () => void }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        onSelect();
      }}
      className={tabClassName(active)}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
      <TabLabel>{label}</TabLabel>
    </Link>
  );
}

/** Pulses while the tapped page is still loading. Must render inside its <Link>. */
function TabLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse" : undefined}>{children}</span>;
}

/**
 * Slides up over the bar; closes on a swipe down, a tap outside it, Escape,
 * or picking something in it.
 *
 * Always mounted and only moved off-screen, so it can slide out as smoothly
 * as it slid in -- and so a dialog opened from inside it (Add module) keeps
 * its state after the sheet has closed behind it. `inert` keeps the hidden
 * sheet out of the tab order and away from screen readers.
 */
function MoreSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
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
        aria-label="More"
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
