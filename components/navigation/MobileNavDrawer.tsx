"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * Navigation for narrow screens, where the sidebar is hidden.
 *
 * The drawer receives the same navigation markup the sidebar renders, so both
 * breakpoints stay in step, and it closes itself whenever the route changes.
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

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Navigation" className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={close} />

          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-white px-5 py-5 shadow-2xl">
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
        </div>
      )}
    </>
  );
}
