"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Z_INDEX } from "@/lib/layout/z-index";

/**
 * Navigation for narrow screens, where the sidebar is hidden.
 *
 * The drawer receives the same navigation markup the sidebar renders, so both
 * breakpoints stay in step. It closes as soon as one of its links is tapped,
 * and whenever the route changes.
 *
 * **The overlay renders into `document.body`, not where it is written.** The
 * button that opens it lives in the top bar, and the top bar carries
 * `backdrop-blur`: an element with a backdrop-filter becomes the containing
 * block for its `position: fixed` descendants, so `inset-0` meant "the 72px
 * header" rather than "the viewport". The drawer was drawn 280x72, the
 * navigation was scrolled out of sight inside it, and a phone got a white box
 * with a close button in it. The header's `z-30` stacking context is the same
 * problem for painting. This is the identical trap Modal documents, and a
 * portal is the only reliable way out of it -- any ancestor may grow a filter,
 * a transform or a perspective later and quietly break this again.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Remembering which route the drawer was opened on lets a navigation close it
  // without an effect: once the path changes, the drawer is no longer open.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const close = () => setOpenedAt(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpenedAt(pathname)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-950 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Navigation" className={`fixed inset-0 ${Z_INDEX.overlay} md:hidden`}>
          <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={close} />

          {/*
            Closes the moment a link in it is tapped, rather than when the
            route finally changes: the route only changes once the next page
            has rendered, so the drawer used to sit open over the old page,
            still marking it current, as though the tap hadn't registered.
            Closing first lets the next page's loading state show at once.
            Not for a click that opens a new tab or window.

            onClick, not onClickCapture: closing unmounts the link, and doing
            that in the capture phase skipped the link's own handler, so Next
            never took the click and the browser fell back to a full reload.
            Bubbling, the link has already started the navigation.
          */}
          <div
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if ((event.target as HTMLElement).closest("a[href]")) close();
            }}
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-white px-5 py-5 shadow-2xl"
          >
            <div className="mb-5 flex justify-end">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={close}
                className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
