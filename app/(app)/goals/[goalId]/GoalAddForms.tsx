"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, Gauge, Plus, X } from "lucide-react";
import { addUtcDays, formatDate, formatDateInput } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import { Modal } from "@/components/overlay/Modal";
import { MEASURE_REMOVAL_CONSEQUENCE } from "@/lib/goals/measure";
import type { GoalActionState } from "../actions";

type FormAction = (state: GoalActionState, formData: FormData) => Promise<GoalActionState>;
const initialState: GoalActionState = {};
const REMOVE_MEASURE_CLASS = "rounded-xl px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50";

function ActionError({ error }: { error?: string }) {
  if (!error) return null;
  return <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>;
}

export function AddMilestoneForm({
  action,
  hasTarget,
  unit,
  goalTargetDate,
}: {
  action: FormAction;
  hasTarget: boolean;
  unit: string | null;
  goalTargetDate: Date | null;
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

  return <AddMilestoneFields action={action} hasTarget={hasTarget} unit={unit} goalTargetDate={goalTargetDate} onDone={() => setExpanded(false)} />;
}

/**
 * Mounted only while the "New milestone" form is open, so a fresh
 * `useActionState` starts each time it is expanded -- kept in the parent,
 * `state.saved` would flip true once and stay true, so a second milestone
 * added in the same session would save with the form never collapsing to
 * show it.
 */
function AddMilestoneFields({ action, hasTarget, unit, goalTargetDate, onDone }: {
  action: FormAction;
  hasTarget: boolean;
  unit: string | null;
  goalTargetDate: Date | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const latestDueDate = goalTargetDate ? formatDateInput(addUtcDays(goalTargetDate, -1)) : undefined;
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <form action={formAction} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">New milestone</p>
        <button type="button" onClick={onDone} aria-label="Cancel adding milestone" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="name" required autoFocus placeholder="What will you do next?" className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-violet-400" />
        {hasTarget && <input name="value" type="number" step="any" min="0" placeholder="2" aria-label="Optional target value" className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none sm:w-24" />}
        {hasTarget && unit && <span className="px-1 text-sm font-medium text-zinc-700">{unit}</span>}
        <span className="px-1 text-sm font-medium uppercase text-zinc-700">by</span>
        <input name="dueDate" type="date" max={latestDueDate} aria-label="Optional milestone due date" title={latestDueDate ? "Must be before the goal target date" : undefined} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-600 outline-none sm:w-40" />
      </div>
      <ActionError error={state.error} />
      <div className="mt-3 flex justify-end"><button disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> {pending ? "Saving…" : "Save milestone"}</button></div>
    </form>
  );
}

export function MilestoneDueDateForm({ action, removeAction, dueDate, goalTargetDate, overdue }: { action: FormAction; removeAction: () => Promise<void>; dueDate: Date | null; goalTargetDate: Date | null; overdue: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(action, initialState);
  const { locale } = useFormatPreferences();
  const formatted = dueDate ? formatDate(dueDate, locale) : undefined;
  const latestDueDate = goalTargetDate ? formatDateInput(addUtcDays(goalTargetDate, -1)) : undefined;

  if (!editing) return <button type="button" onClick={() => setEditing(true)} className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium hover:text-violet-700 ${overdue ? "text-red-600" : "text-zinc-500"}`}><CalendarDays className="h-3.5 w-3.5" />{formatted ? `Due ${formatted} · Edit` : "Add due date"}</button>;

  return <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
    <input name="dueDate" type="date" max={latestDueDate} aria-label="Milestone due date" title={latestDueDate ? "Must be before the goal target date" : undefined} defaultValue={dueDate ? formatDateInput(dueDate) : ""} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400" />
    <button className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white">Save date</button>
    {dueDate && <button formAction={removeAction} className="h-9 px-2 text-xs font-semibold text-red-500">Remove</button>}
    <button type="button" onClick={() => setEditing(false)} className="h-9 px-2 text-xs font-medium text-zinc-500">Cancel</button>
    {state.error && <p role="alert" className="w-full text-xs font-medium text-red-600">{state.error}</p>}
  </form>;
}

/**
 * The measure and its removal share a panel because they are one decision, but
 * only one of them cascades. Removing a measure a milestone is using takes that
 * milestone's value with it, so the dialog names the consequence before anything
 * is written; a measure nothing depends on is removed as directly as before,
 * with no warning to dismiss. Whether it cascades is the server's call either
 * way -- this only decides whether to ask first.
 */
export function MeasurableTargetForm({
  action,
  removeAction,
  units,
  targetValue,
  currentValue,
  unit,
  measuredMilestones,
}: {
  action: FormAction;
  removeAction: FormAction;
  units: string[];
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  /** How many milestones hold a value in this measure and would lose it with it. */
  measuredMilestones: number;
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
    <MeasurableTargetFields
      action={action}
      removeAction={removeAction}
      units={units}
      targetValue={targetValue}
      currentValue={currentValue}
      unit={unit}
      measuredMilestones={measuredMilestones}
      onDone={() => setExpanded(false)}
    />
  );
}

/**
 * Mounted only while the measurable-target panel is open, so both actions'
 * `useActionState` start fresh each time -- kept in the parent, `saved` would
 * flip true once and stay true, so a second update in the same session would
 * save with the panel never collapsing to show it.
 */
function MeasurableTargetFields({ action, removeAction, units, targetValue, currentValue, unit, measuredMilestones, onDone }: {
  action: FormAction;
  removeAction: FormAction;
  units: string[];
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  measuredMilestones: number;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, initialState);
  const hasTarget = targetValue !== null;
  const cascades = measuredMilestones > 0;
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);
  useEffect(() => { if (removeState.saved) onDone(); }, [removeState.saved, onDone]);

  return (
    <>
      <form action={formAction} className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:grid-cols-3">
        <div className="flex items-center justify-between sm:col-span-3">
          <p className="text-sm font-semibold text-zinc-800">{hasTarget ? "Update measurable target" : "New measurable target"}</p>
          <button type="button" onClick={onDone} aria-label="Close measurable target form" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Target value<input name="targetValue" type="number" min="0" step="any" required defaultValue={targetValue ?? ""} placeholder="120,000" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Unit<input name="unit" required list="goal-units" defaultValue={unit ?? ""} placeholder="$AUD, Books..." className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /><datalist id="goal-units">{units.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current value<input name="currentValue" type="number" min="0" step="any" required defaultValue={currentValue ?? ""} placeholder="2,000" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none focus:border-violet-400" /></label>
        {state.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{state.error}</p>}
        {removeState.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{removeState.error}</p>}
        <div className="flex gap-2 sm:col-span-3">
          <button disabled={pending} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{pending ? "Saving…" : hasTarget ? "Update values" : "Add target"}</button>
          {hasTarget && (cascades
            ? <button type="button" onClick={() => setConfirming(true)} className={REMOVE_MEASURE_CLASS}>Remove</button>
            : <button formAction={removeFormAction} disabled={removePending} className={REMOVE_MEASURE_CLASS}>{removePending ? "Removing…" : "Remove"}</button>)}
        </div>
      </form>

      {confirming && (
        <Modal title="Are you sure?" eyebrow="Remove measurable target" onClose={() => setConfirming(false)}>
          <p className="leading-7 text-zinc-600">{MEASURE_REMOVAL_CONSEQUENCE}</p>
          <form action={removeFormAction} className="mt-7 flex flex-wrap justify-end gap-3">
            <input type="hidden" name="confirmed" value="true" />
            <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button className="h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700">Remove</button>
          </form>
        </Modal>
      )}
    </>
  );
}
