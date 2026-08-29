"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Circle, Ellipsis, RotateCcw, TriangleAlert, X } from "lucide-react";
import { displayNumber } from "@/lib/goals/format";
import { formatDate, formatDeadline } from "@/lib/dates";

type FormAction = (formData: FormData) => Promise<void>;
const AUTO_COMPLETION_FEEDBACK_MS = 15_000;
const AUTO_COMPLETION_FADE_MS = 500;
type FeedbackState = "visible" | "fading" | "hidden";

function autoCompletionFeedbackState(autoCompleted: boolean, completedAt: Date | null): FeedbackState {
  if (!autoCompleted || completedAt === null) return "hidden";
  const remaining = completedAt.getTime() + AUTO_COMPLETION_FEEDBACK_MS - Date.now();
  if (remaining <= 0) return "hidden";
  return remaining <= AUTO_COMPLETION_FADE_MS ? "fading" : "visible";
}

export function MilestoneRow({ milestone, unit, goalTargetDate, toggleAction, updateAction, duplicateAction, deleteAction }: {
  milestone: { id: string; name: string; value: number | null; dueDate: Date | null; completed: boolean; completedAt: Date | null; autoCompleted: boolean };
  unit: string | null;
  goalTargetDate: Date | null;
  toggleAction: () => Promise<void>;
  updateAction: FormAction;
  duplicateAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [autoCompletionFeedback, setAutoCompletionFeedback] = useState<FeedbackState>(() => autoCompletionFeedbackState(milestone.autoCompleted, milestone.completedAt));
  const now = new Date();
  const overdue = !milestone.completed && Boolean(milestone.dueDate && milestone.dueDate < now);
  const date = milestone.dueDate ? formatDate(milestone.dueDate) : undefined;
  const completedDate = milestone.completedAt ? formatDate(milestone.completedAt) : undefined;
  const latestDueDate = goalTargetDate ? new Date(goalTargetDate.getTime() - 86_400_000).toISOString().slice(0, 10) : undefined;
  const title = `${milestone.name}${milestone.value === null ? "" : ` ${displayNumber(milestone.value, unit)}`}`;

  useEffect(() => {
    const nextState = autoCompletionFeedbackState(milestone.autoCompleted, milestone.completedAt);
    const remaining = milestone.completedAt ? milestone.completedAt.getTime() + AUTO_COMPLETION_FEEDBACK_MS - Date.now() : 0;
    const showTimeout = window.setTimeout(() => setAutoCompletionFeedback(nextState), 0);
    const fadeTimeout = nextState === "visible" ? window.setTimeout(() => setAutoCompletionFeedback("fading"), Math.max(0, remaining - AUTO_COMPLETION_FADE_MS)) : undefined;
    const hideTimeout = nextState !== "hidden" ? window.setTimeout(() => setAutoCompletionFeedback("hidden"), Math.max(0, remaining)) : undefined;
    return () => {
      window.clearTimeout(showTimeout);
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout);
      if (hideTimeout !== undefined) window.clearTimeout(hideTimeout);
    };
  }, [milestone.autoCompleted, milestone.completedAt]);

  function dismissAutoCompletionFeedback() {
    setAutoCompletionFeedback("fading");
    window.setTimeout(() => setAutoCompletionFeedback("hidden"), AUTO_COMPLETION_FADE_MS);
  }

  if (editing) return <form action={updateAction} className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input name="name" required autoFocus defaultValue={milestone.name} aria-label="Milestone title" className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-violet-400" />
      <input name="value" type="number" step="any" min="0" defaultValue={milestone.value ?? ""} placeholder="2" aria-label="Optional target value" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none sm:w-24" />
      {unit && <span className="px-1 text-sm font-medium text-zinc-700">{unit}</span>}
      <span className="px-1 text-sm font-medium uppercase text-zinc-700">by</span>
      <input name="dueDate" type="date" max={latestDueDate} defaultValue={milestone.dueDate?.toISOString().slice(0, 10) ?? ""} aria-label="Optional due date" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-600 outline-none sm:w-40" />
      <button className="h-11 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Save</button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel editing" className="rounded-lg p-2 text-zinc-400 hover:bg-white"><X className="h-5 w-5" /></button>
    </div>
  </form>;

  return <div role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setEditing(true); }} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition hover:border-violet-200 hover:bg-violet-50/30 ${milestone.completed ? "border-emerald-100 bg-emerald-50/60" : "border-zinc-200"}`}>
    <form action={toggleAction} onClick={(event) => event.stopPropagation()}><button aria-label={milestone.completed ? "Reopen milestone" : "Complete milestone"} className="mt-0.5 text-zinc-400">{milestone.completed ? <Check className="h-6 w-6 rounded-full bg-emerald-500 p-1 text-white"/> : <Circle className="h-6 w-6"/>}</button></form>
    <div className="min-w-0 flex-1">
      <p className={`font-medium ${milestone.completed ? "text-zinc-500 line-through" : "text-zinc-900"}`}>{title}</p>
      {milestone.completed ? <p className="mt-1 text-xs font-medium text-emerald-700">Completed{completedDate ? ` ${completedDate}` : ""}</p> : milestone.dueDate && <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${overdue ? "text-red-600" : "text-zinc-500"}`}>{overdue ? <TriangleAlert className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}{date} · {formatDeadline(milestone.dueDate, now)}</p>}
      {autoCompletionFeedback !== "hidden" && <div role="status" className={`mt-3 flex w-fit items-center gap-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-all duration-500 ${autoCompletionFeedback === "fading" ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"}`}>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 bg-amber-400" />Completed automatically</span>
        <form action={toggleAction} onClick={(event) => event.stopPropagation()}><button className="inline-flex items-center gap-1 font-semibold hover:text-amber-950"><RotateCcw className="h-3.5 w-3.5"/> Undo</button></form>
        <button type="button" onClick={(event) => { event.stopPropagation(); dismissAutoCompletionFeedback(); }} aria-label="Dismiss automatic completion message" className="p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-800"><X className="h-3.5 w-3.5" /></button>
      </div>}
    </div>
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary aria-label="Milestone actions" className="list-none rounded-lg p-2 text-zinc-400 hover:bg-white hover:text-zinc-700"><Ellipsis className="h-5 w-5" /></summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 text-sm shadow-lg">
        <button type="button" onClick={() => setEditing(true)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-50">Edit milestone</button>
        <form action={duplicateAction}><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-50">Duplicate</button></form>
        <form action={deleteAction}><button className="w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">Delete</button></form>
      </div>
    </details>
  </div>;
}
