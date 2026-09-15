"use client";

import { RefreshCcw } from "lucide-react";

/**
 * A lost-update conflict (BUG-007) reads to the person very differently than
 * an ordinary validation refusal -- it isn't something they can fix by
 * changing what's in the form, since the form itself is what's stale. This
 * gives it a distinct, actionable treatment (amber, not the same red as a
 * validation error) with the one thing that actually resolves it: a real
 * reload, so a form still holding the old values isn't resubmitted over
 * whatever changed. A soft `router.refresh()` would bring the page's own
 * props up to date but leave every field's own uncontrolled, already-typed
 * value exactly as stale as it was -- the next save would still overwrite
 * the other change, just with a stamp that now happens to match.
 */
export function SaveConflictNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      <span>{message}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
      >
        <RefreshCcw className="h-3.5 w-3.5" />Reload
      </button>
    </div>
  );
}
