"use client";

import { useState } from "react";
import { CalendarDays, Gauge, Plus, X } from "lucide-react";

type FormAction = (formData: FormData) => Promise<void>;

export function AddMilestoneForm({
  action,
  hasTarget,
}: {
  action: FormAction;
  hasTarget: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
      >
        <Plus className="h-4 w-4" /> Add milestone
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">New milestone</p>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Cancel adding milestone" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="name" required autoFocus placeholder="What is the next meaningful checkpoint?" className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-violet-400" />
        {hasTarget && <input name="value" type="number" step="any" min="0" placeholder="Numeric value" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none sm:w-36" />}
        <input name="dueDate" type="date" aria-label="Optional milestone due date" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-600 outline-none sm:w-40" />
        <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Save milestone</button>
      </div>
    </form>
  );
}

export function MilestoneDueDateForm({ action, removeAction, dueDate }: { action: FormAction; removeAction: () => Promise<void>; dueDate: Date | null }) {
  const [editing, setEditing] = useState(false);
  const formatted = dueDate?.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  if (!editing) return <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-violet-700"><CalendarDays className="h-3.5 w-3.5" />{formatted ? `Due ${formatted} · Edit` : "Add due date"}</button>;

  return <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
    <input name="dueDate" type="date" aria-label="Milestone due date" defaultValue={dueDate?.toISOString().slice(0, 10) ?? ""} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400" />
    <button className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white">Save date</button>
    {dueDate && <button formAction={removeAction} className="h-9 px-2 text-xs font-semibold text-red-500">Remove</button>}
    <button type="button" onClick={() => setEditing(false)} className="h-9 px-2 text-xs font-medium text-zinc-500">Cancel</button>
  </form>;
}

export function MeasurableTargetForm({
  action,
  removeAction,
  units,
  targetValue,
  currentValue,
  unit,
}: {
  action: FormAction;
  removeAction: FormAction;
  units: string[];
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTarget = targetValue !== null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-5 flex h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
      >
        <Gauge className="h-4 w-4" /> {hasTarget ? "Update measurable target" : "Add measurable target"}
      </button>
    );
  }

  return (
    <form action={action} className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:grid-cols-3">
      <div className="flex items-center justify-between sm:col-span-3">
        <p className="text-sm font-semibold text-zinc-800">{hasTarget ? "Update measurable target" : "New measurable target"}</p>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Close measurable target form" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Target value<input name="targetValue" type="number" min="0" step="any" required defaultValue={targetValue ?? ""} placeholder="120,000" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Unit<input name="unit" required list="goal-units" defaultValue={unit ?? ""} placeholder="$AUD, Books..." className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /><datalist id="goal-units">{units.map((item) => <option key={item} value={item} />)}</datalist></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current value<input name="currentValue" type="number" min="0" step="any" required defaultValue={currentValue ?? ""} placeholder="2,000" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /></label>
      <div className="flex gap-2 sm:col-span-3"><button className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">{hasTarget ? "Update values" : "Add target"}</button>{hasTarget && <button formAction={removeAction} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50">Remove</button>}</div>
    </form>
  );
}
