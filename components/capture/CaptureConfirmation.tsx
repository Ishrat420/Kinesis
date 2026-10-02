"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { undoCaptureAction } from "@/app/(app)/todos/actions";
import { Z_INDEX } from "@/lib/layout/z-index";

const VISIBLE_MS = 12_000;

/**
 * The feedback a capture gets (KD-008A): what was recorded, a way to add the
 * detail the user skipped, and a way to take it back.
 *
 * Undo is offered rather than a confirmation step before saving. Confirming
 * costs every capture a decision; undoing costs only the captures that were a
 * mistake, which is the trade ADR-009 asks for.
 */
export function CaptureConfirmation({ todo, onAddDetails, onUndone }: { todo: { id: string; name: string }; onAddDetails: () => void; onUndone: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const [undoing, startUndo] = useTransition();

  // The caller keys this component on the capture, so a second capture mounts a
  // fresh confirmation rather than inheriting the previous one's timer.
  useEffect(() => {
    const timer = window.setTimeout(() => setDismissed(true), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (dismissed) return null;

  return (
    // On a phone the bar is too narrow for everything on one line: the
    // message was squeezed to nothing and the close button pushed out past
    // the edge. There the actions wrap onto a second row under the message,
    // and the close button stays beside it; from sm it's the one row again.
    <div role="status" aria-live="polite" className={`absolute inset-x-0 top-[60px] ${Z_INDEX.banner} flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_20px_50px_rgb(0,0,0,0.14)] sm:flex-nowrap`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /></span>
      <p className="line-clamp-2 min-w-0 flex-1 text-sm text-zinc-700 sm:line-clamp-none sm:truncate">To-Do created: <span className="font-semibold text-zinc-900">{todo.name}</span></p>
      <div className="order-2 flex basis-full justify-end gap-1 sm:order-none sm:basis-auto sm:gap-3">
        <button type="button" onClick={onAddDetails} className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100">Add details</button>
        <button
          type="button" disabled={undoing}
          onClick={() => startUndo(async () => { await undoCaptureAction(todo.id); onUndone(); })}
          className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60"
        >{undoing ? "Undoing…" : "Undo"}</button>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="order-1 shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 sm:order-none"><X className="h-4 w-4" /></button>
    </div>
  );
}
