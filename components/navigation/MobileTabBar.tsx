"use client";

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, House, LayoutGrid, ListTodo, Plus, type LucideIcon } from "lucide-react";
import { requestCaptureFocus } from "@/lib/capture/focus";
import { BottomSheet } from "@/components/overlay/BottomSheet";
import { Z_INDEX } from "@/lib/layout/z-index";
import { tabForPath, tabSlot, type TabId } from "@/lib/navigation/tab-bar";

/** iOS's own sheet curve: quick to start, long soft landing. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

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

      <BottomSheet open={moreOpen} onClose={closeMore} ariaLabel="More">{children}</BottomSheet>
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
