"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

/**
 * A form's submit button that shows the form is working: while its form's
 * action is in flight it is disabled and a spinner takes the place of its
 * content. Otherwise it is exactly the `<button>` it replaces -- same classes,
 * same children -- so any submit button can swap to this without restyling.
 *
 * The content stays in place, only hidden, so the button keeps its size and
 * nothing around it jumps. On a form with more than one submit button, give
 * every one of them its `formAction` (the form's own action included): the
 * spinner then shows only on the button that was pressed, and the others are
 * just disabled.
 */
export function SubmitButton({
  className = "",
  children,
  disabled,
  formAction,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "formAction"> & { formAction?: (data: FormData) => void | Promise<void> }) {
  const status = useFormStatus();
  // With a formAction, only the button whose action is running is busy; the
  // form's other buttons are just disabled.
  const busy = status.pending && (!formAction || status.action === formAction);
  return (
    <button
      {...props}
      type="submit"
      formAction={formAction}
      disabled={disabled || status.pending}
      aria-busy={busy || undefined}
      className={`relative ${status.pending ? "cursor-wait" : ""} ${className}`}
    >
      <span className="contents" style={busy ? { visibility: "hidden" } : undefined}>{children}</span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <LoaderCircle className="h-4 w-4 animate-spin" />
        </span>
      )}
    </button>
  );
}
