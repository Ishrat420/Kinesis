"use client";

import { useState } from "react";
import { CalendarDays, Check, Circle, Ellipsis, RotateCcw, TriangleAlert, X } from "lucide-react";
import { displayNumber, milestoneTimingLabel } from "@/lib/goals/format";

type FormAction = (formData: FormData) => Promise<void>;

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
  const now = new Date();
  const overdue = !milestone.completed && Boolean(milestone.dueDate && milestone.dueDate < now);
  const date = milestone.dueDate?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const completedDate = milestone.completedAt?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const latestDueDate = goalTargetDate ? new Date(goalTargetDate.getTime() - 86_400_000).toISOString().slice(0, 10) : undefined;
  const title = `${milestone.name}${milestone.value === null ? "" : ` ${displayNumber(milestone.value, unit)}`}`;

  if (editing) return <form action={updateAction} className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input name="name" required autoFocus defaultValue={milestone.name} aria-label="Milestone title" className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-violet-400" />
      <input name="value" type="number" step="any" min="0" defaultValue={milestone.value ?? ""} placeholder="2" aria-label="Optional target value" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none sm:w-24" />
      {unit && <span className="px-1 text-sm font-medium text-zinc-700">{unit}</span>}
      <span className="px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">by</span>
      <input name="dueDate" type="date" max={latestDueDate} defaultValue={milestone.dueDate?.toISOString().slice(0, 10) ?? ""} aria-label="Optional due date" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-600 outline-none sm:w-40" />
      <button className="h-11 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Save</button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel editing" className="rounded-lg p-2 text-zinc-400 hover:bg-white"><X className="h-5 w-5" /></button>
    </div>
  </form>;

  return <div role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setEditing(true); }} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition hover:border-violet-200 hover:bg-violet-50/30 ${milestone.completed ? "border-emerald-100 bg-emerald-50/60" : "border-zinc-200"}`}>
    <form action={toggleAction} onClick={(event) => event.stopPropagation()}><button aria-label={milestone.completed ? "Reopen milestone" : "Complete milestone"} className="mt-0.5 text-zinc-400">{milestone.completed ? <Check className="h-6 w-6 rounded-full bg-emerald-500 p-1 text-white"/> : <Circle className="h-6 w-6"/>}</button></form>
    <div className="min-w-0 flex-1">
      <p className={`font-medium ${milestone.completed ? "text-zinc-500 line-through" : "text-zinc-900"}`}>{title}</p>
      {milestone.completed ? <p className="mt-1 text-xs font-medium text-emerald-700">Completed{completedDate ? ` ${completedDate}` : ""}</p> : milestone.dueDate && <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${overdue ? "text-red-600" : "text-zinc-500"}`}>{overdue ? <TriangleAlert className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}{date} · {milestoneTimingLabel(milestone.dueDate, now)}</p>}
      {milestone.autoCompleted && <p className="mt-1 text-xs font-medium text-emerald-600">Completed automatically</p>}
    </div>
    {milestone.autoCompleted && <form action={toggleAction} onClick={(event) => event.stopPropagation()}><button title="Undo" className="rounded-lg p-2 text-zinc-400 hover:bg-white"><RotateCcw className="h-4 w-4"/></button></form>}
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
