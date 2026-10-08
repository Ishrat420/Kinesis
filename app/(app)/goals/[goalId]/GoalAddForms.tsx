"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarDays, Gauge, Plus, X } from "lucide-react";
import { addUtcDays, formatDate, formatDateInput } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import { Modal } from "@/components/overlay/Modal";
import { MEASURE_REMOVAL_CONSEQUENCE } from "@/lib/goals/measure";
import type { GoalActionState } from "../actions";
import { TEXT_LIMIT } from "@/lib/validation/field-limits";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { initialRepeat, RepeatButton, RepeatFields, type RepeatState } from "@/components/recurrence/RepeatControls";
import type { Recurrence } from "@/lib/recurrence";

const REPEAT_FIELD_CLASS = "w-full rounded-xl border-[1.5px] border-zinc-200 bg-white text-base text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 sm:text-sm";

/**
 * A milestone's repeat (KD-056): the shared repeat button and Repeats fields,
 * in Goals' violet at the milestone form's 44px size, plus the two rules only
 * milestones have. A milestone with a target value can't repeat -- it
 * completes itself when the goal reaches it -- and the goal's target date
 * ends the repeat, so the form says when, and calls the last occurrence
 * before it the last one.
 *
 * Returns the pieces separately: the button goes on the date field, the
 * fields go on a row of their own under it.
 */
export function useMilestoneRepeat({ initial, dueDate, valueEntered, goalTargetDate }: { initial?: Recurrence | null; dueDate: string; valueEntered: boolean; goalTargetDate: Date | null }) {
  const [repeat, setRepeat] = useState<RepeatState>(() => initialRepeat(initial));
  const { locale } = useFormatPreferences();
  const blocked = !dueDate ? "Pick a due date first" : valueEntered ? "A milestone with a target value can't repeat" : null;
  const on = repeat.on && !blocked;
  const button = <RepeatButton accent="violet" size="sm" on={on} disabled={blocked !== null} disabledReason={blocked ?? undefined} onToggle={() => setRepeat((current) => ({ ...current, on: !current.on }))} />;
  const fields = (
    <div className="flex sm:justify-end">
      <RepeatFields
        repeat={{ ...repeat, on }} onChange={setRepeat} dueDate={dueDate} fieldClass={REPEAT_FIELD_CLASS} size="sm" className="w-full sm:w-56"
        lastBefore={goalTargetDate}
        footnote={goalTargetDate ? `Repeats until ${formatDate(addUtcDays(goalTargetDate, -1), locale)}` : undefined}
      />
    </div>
  );
  return { button, fields };
}

type FormAction = (state: GoalActionState, formData: FormData) => Promise<GoalActionState>;
const initialState: GoalActionState = {};
const REMOVE_MEASURE_CLASS = "rounded-xl px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50";

function ActionError({ error }: { error?: string }) {
  if (!error) return null;
  return <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>;
}

/**
 * A due-date field that reads as a row with an answer on it ("Due 5 Jan
 * 2026") rather than a native date input's blank box -- which, empty and
 * unstyled, is easy to mistake for a broken field, especially on mobile
 * Safari where it shows nothing at all until a value is picked. The real
 * input still covers the row so it stays keyboard- and screen-reader-operable.
 */
export function DueDateField({ value, onChange, max, ariaLabel, addon }: { value: string; onChange: (value: string) => void; max?: string; ariaLabel: string; addon?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const { locale } = useFormatPreferences();
  const inputRef = useRef<HTMLInputElement>(null);

  const field = (
    <div
      onClick={() => inputRef.current?.showPicker?.()}
      className={`relative flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-[1.5px] bg-white px-3 transition ${addon ? "rounded-l-xl border-r-0" : "rounded-xl"} ${
        focused ? "border-violet-500 ring-4 ring-violet-500/15" : "border-zinc-200"
      }`}
    >
      <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
      <span className={`flex-1 truncate text-base sm:text-sm ${value ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
        {value ? formatDate(value, locale) : "Select a date"}
      </span>
      <input
        ref={inputRef}
        type="date"
        name="dueDate"
        aria-label={ariaLabel}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
  // `addon` (KD-056): the repeat button, joined onto the field's right edge as one control.
  return addon ? <div className="flex">{field}{addon}</div> : field;
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
  const [dueDate, setDueDate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const repeat = useMilestoneRepeat({ dueDate, valueEntered: hasTarget && targetValue.trim() !== "", goalTargetDate });
  const latestDueDate = goalTargetDate ? formatDateInput(addUtcDays(goalTargetDate, -1)) : undefined;
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <form autoComplete="off" spellCheck={false} action={formAction} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">New milestone</p>
        <button type="button" onClick={onDone} aria-label="Cancel adding milestone" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="name"
          required
          autoFocus
          placeholder="What will you do next?"
          className="h-11 min-w-0 flex-1 rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 sm:text-sm"
        />
        {hasTarget && (
          <input
            name="value"
            type="number"
            step="any"
            min="0"
            placeholder="2"
            aria-label="Optional target value"
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            className="h-11 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 sm:w-24 sm:text-sm"
          />
        )}
        {hasTarget && unit && <span className="px-1 text-sm font-medium text-zinc-700">{unit}</span>}
        <span className="px-1 text-sm font-medium uppercase text-zinc-700">by</span>
        <div className="sm:w-56">
          <DueDateField
            value={dueDate}
            onChange={setDueDate}
            max={latestDueDate}
            ariaLabel={latestDueDate ? "Milestone due date, must be before the goal target date" : "Optional milestone due date"}
            addon={repeat.button}
          />
        </div>
      </div>
      <div className="mt-3">{repeat.fields}</div>
      <ActionError error={state.error} />
      <div className="mt-4 flex justify-end"><button disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"><Plus className="h-4 w-4" /> {pending ? "Saving…" : "Save milestone"}</button></div>
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

  return <form autoComplete="off" spellCheck={false} action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
    <input name="dueDate" type="date" max={latestDueDate} aria-label="Milestone due date" title={latestDueDate ? "Must be before the goal target date" : undefined} defaultValue={dueDate ? formatDateInput(dueDate) : ""} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400" />
    <SubmitButton formAction={formAction} className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white">Save date</SubmitButton>
    {dueDate && <SubmitButton formAction={removeAction} className="h-9 px-2 text-xs font-semibold text-red-500">Remove</SubmitButton>}
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
      <form autoComplete="off" spellCheck={false} action={formAction} className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:grid-cols-3">
        <div className="flex items-center justify-between sm:col-span-3">
          <p className="text-sm font-semibold text-zinc-800">{hasTarget ? "Update measurable target" : "New measurable target"}</p>
          <button type="button" onClick={onDone} aria-label="Close measurable target form" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Target value<input name="targetValue" type="number" min="0" step="any" required defaultValue={targetValue ?? ""} placeholder="120,000" className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15" /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Unit<input name="unit" required list="goal-units" defaultValue={unit ?? ""} maxLength={TEXT_LIMIT} placeholder="$AUD, Books..." className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15" /><datalist id="goal-units">{units.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current value<input name="currentValue" type="number" min="0" step="any" required defaultValue={currentValue ?? ""} placeholder="2,000" className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-zinc-200 bg-white px-4 text-base font-semibold text-zinc-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15" /></label>
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
          <form autoComplete="off" spellCheck={false} action={removeFormAction} className="mt-7 flex flex-wrap justify-end gap-3">
            <input type="hidden" name="confirmed" value="true" />
            <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <SubmitButton className="h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700">Remove</SubmitButton>
          </form>
        </Modal>
      )}
    </>
  );
}
