"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The application's dialog shell.
 *
 * Two things here are not cosmetic:
 *
 * 1. **It renders into `document.body`, not where it is written.** A dialog
 *    opened from the top bar was previously clipped: the header carries
 *    `backdrop-blur`, and an element with a backdrop-filter becomes the
 *    containing block for `position: fixed` descendants. `inset-0` then means
 *    "the 72px header", not "the viewport", so a centred panel overflowed that
 *    band and its top could not be reached. The header's `z-30` stacking
 *    context is the same problem for painting. A portal escapes both, and it is
 *    the only reliable way to do so -- any ancestor may grow a filter, a
 *    transform or a perspective later and quietly break a nested dialog again.
 *
 * 2. **The backdrop scrolls, the panel does not.** Centring with flexbox clips
 *    the top of any child taller than its container, because a scroll container
 *    cannot scroll to a negative offset. `min-h-full` on the centring wrapper
 *    inside a scrollable backdrop keeps the whole panel reachable at any
 *    viewport height or zoom level.
 *
 * On narrow screens the panel is a bottom sheet, and centred from `sm` up.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  labelledBy,
}: {
  /** Rendered as the dialog's heading. Omit and pass `labelledBy` to label it with your own element. */
  title?: React.ReactNode;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  const headingId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  // A modal is only ever mounted by an interaction, so it never renders on the
  // server and this cannot desynchronise hydration.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/35 backdrop-blur-sm">
      {/* The wrapper fills the scrollable area, so a click anywhere off the
          panel closes -- and mousedown rather than click, so a text selection
          that ends outside the panel does not dismiss it. */}
      <div
        className="flex min-h-full items-end justify-center sm:items-center sm:p-5"
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        <div
          role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? headingId}
          className="w-full rounded-t-3xl bg-white p-7 shadow-2xl sm:max-w-lg sm:rounded-3xl"
        >
          {title !== undefined && (
            <div className="mb-7 flex items-start justify-between gap-4">
              <div className="min-w-0">
                {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>}
                <h2 id={headingId} className={`${eyebrow ? "mt-2 " : ""}break-words text-2xl font-semibold`}>{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
