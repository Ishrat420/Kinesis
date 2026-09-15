"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarClock, CircleCheck, X } from "lucide-react";
import { formatDateInput } from "@/lib/dates";

const initialActionState: { error?: string } = {};

/**
 * A milestone or to-do that is overdue or due soon is never completed (that
 * is what got it onto the card showing it), so its two useful actions are
 * resolving it outright -- mark it complete -- or moving its due date. Shared
 * by Needs Attention and Upcoming & Due rather than duplicated, since the UI
 * and the reasoning behind it are identical in both places; only which action
 * each button calls differs.
 */
export function ResolveActions({ dueDate, onComplete, complete, reschedule }: {
  dueDate: string;
  /**
   * Optional: a caller with its own local list (Needs Attention's dismissed
   * set) uses this to hide the row instantly rather than wait on the next
   * server refresh. A caller with no such list -- Upcoming & Due, a plain
   * Server Component -- can only ever pass real server actions here (bound
   * arguments, never a wrapping closure), since a closure cannot cross a
   * Server-to-Client Component boundary; it simply omits this prop and lets
   * the action's own revalidation remove the row on the next render.
   */
  onComplete?: () => void;
  complete: () => Promise<{ error?: string }>;
  reschedule: (previousState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [state, formAction] = useActionState(reschedule, initialActionState);
  // Completing reports its outcome too, so an item that has since been
  // deleted says so here rather than throwing past the dashboard. onComplete
  // removes this row from the caller's own list, so it can only run once the
  // save is confirmed -- calling it on submit, before the action resolves,
  // would unmount this row (and any error it has to show) right along with it.
  const [completing, startCompleting] = useTransition();
  const [completeError, setCompleteError] = useState<string | null>(null);
  const handleComplete = () => startCompleting(async () => {
    setCompleteError(null);
    const result = await complete();
    if (result.error) setCompleteError(result.error);
    else onComplete?.();
  });

  if (rescheduling) {
    return <form action={formAction} onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <input name="dueDate" type="date" required autoFocus defaultValue={formatDateInput(dueDate)} aria-label="New due date" className="h-9 rounded-lg border border-zinc-200 px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400" />
        <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">Save</button>
        <button type="button" onClick={() => setRescheduling(false)} aria-label="Cancel reschedule" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      {state.error && <p role="alert" className="text-xs font-medium text-red-600">{state.error}</p>}
    </form>;
  }

  return <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center gap-2">
      <button type="button" disabled={completing} onClick={handleComplete} aria-label="Mark complete" title="Mark complete" className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"><CircleCheck className="h-5 w-5" /></button>
      <button type="button" onClick={() => setRescheduling(true)} aria-label="Reschedule" title="Reschedule" className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"><CalendarClock className="h-5 w-5" /></button>
    </div>
    {completeError && <p role="alert" className="text-xs font-medium text-red-600">{completeError}</p>}
  </div>;
}
