"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Z_INDEX } from "@/lib/layout/z-index";

const focusableSelector = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

const openPanels: HTMLElement[] = [];
let scrollLocks = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

function visibleFocusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0,
  );
}

type ModalProps = {
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  /** Adds to the responsive bottom-sheet/centred-dialog panel styles. */
  panelClassName?: string;
  /** Used in preference to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Hides the standard header so the caller can render a bespoke one. */
  customHeader?: boolean;
  descriptionId?: string;
} & (
  | { title: ReactNode; labelledBy?: never; ariaLabel?: never }
  | { title?: never; labelledBy: string; ariaLabel?: never }
  | { title?: never; labelledBy?: never; ariaLabel: string }
);

/**
 * The application's modal primitive: a bottom sheet below `sm`, a centred
 * dialog above it, and a portal so filtered/transformed ancestors cannot clip
 * it. It owns keyboard focus and page scroll for its entire mounted lifetime.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  labelledBy,
  ariaLabel,
  descriptionId,
  panelClassName = "",
  initialFocusRef,
  customHeader = false,
}: ModalProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openPanels.push(panel);

    if (scrollLocks++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousBodyPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusInitialElement = () => {
      const requested = initialFocusRef?.current;
      const autofocus = panel.querySelector<HTMLElement>("[autofocus]");
      (requested && panel.contains(requested) ? requested : autofocus ?? visibleFocusableElements(panel)[0] ?? panel).focus();
    };
    // Run after descendants' effects and the portal have settled.
    const frame = window.requestAnimationFrame(focusInitialElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openPanels.at(-1) !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = visibleFocusableElements(panel);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (openPanels.at(-1) === panel && !panel.contains(event.target as Node)) focusInitialElement();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", containFocus);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", containFocus);
      const index = openPanels.lastIndexOf(panel);
      if (index !== -1) openPanels.splice(index, 1);
      if (--scrollLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.paddingRight = previousBodyPaddingRight;
      }
      // Nested dialogs restore into the dialog beneath them; ordinary dialogs
      // restore to the control that launched them.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [initialFocusRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 ${Z_INDEX.overlay} overflow-y-auto overscroll-contain bg-zinc-950/35 backdrop-blur-sm`}>
      <div
        className="flex min-h-full items-end justify-center sm:items-center sm:p-5"
        onPointerDown={(event) => { if (event.target === event.currentTarget && event.button === 0) onClose(); }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy ?? (title !== undefined ? headingId : undefined)}
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={`max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-lg sm:rounded-3xl sm:pb-7 ${panelClassName}`}
        >
          {!customHeader && title !== undefined && (
            <div className="mb-7 flex items-start justify-between gap-4">
              <div className="min-w-0">
                {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>}
                <h2 id={headingId} className={`${eyebrow ? "mt-2 " : ""}break-words text-2xl font-semibold`}>{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900">
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
