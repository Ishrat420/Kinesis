"use client";

import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import { CalendarDays, Check, Circle, Ellipsis, Repeat2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { displayNumber } from "@/lib/goals/format";
import { addUtcDays, formatDate, formatDateInput, formatDeadline } from "@/lib/dates";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import type { GoalActionState } from "../actions";
import { DueDateField, MilestoneValueField, useMilestoneRepeat } from "./GoalAddForms";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Snackbar } from "@/components/ui/Snackbar";
import { followingOccurrence, recurrenceFromColumns, recurrenceLabel, type Recurrence, type RecurrenceRule } from "@/lib/recurrence";

type FormAction = (state: GoalActionState, formData: FormData) => Promise<GoalActionState>;
const initialState: GoalActionState = {};
const AUTO_COMPLETION_FEEDBACK_MS = 15_000;
const AUTO_COMPLETION_FADE_MS = 500;
type FeedbackState = "visible" | "fading" | "hidden";

function autoCompletionFeedbackState(autoCompleted: boolean, completedAt: Date | null): FeedbackState {
  if (!autoCompleted || completedAt === null) return "hidden";
  const remaining = completedAt.getTime() + AUTO_COMPLETION_FEEDBACK_MS - Date.now();
  if (remaining <= 0) return "hidden";
  return remaining <= AUTO_COMPLETION_FADE_MS ? "fading" : "visible";
}

export function MilestoneRow({ milestone, hasTarget, unit, goalTargetDate, toggleAction, updateAction, duplicateAction, deleteAction }: {
  milestone: {
    id: string; name: string; value: number | null; dueDate: Date | null; completed: boolean; completedAt: Date | null; autoCompleted: boolean;
    /** KD-056: the repeat rule's stored columns, and how many occurrences have been ticked. */
    recurrence: RecurrenceRule | null; recurrenceDays: number | null; recurrenceAnchorDay: number | null; completedOccurrences: number;
  };
  /** Whether the goal still has a measure. Without one there is no value to hold. */
  hasTarget: boolean;
  unit: string | null;
  goalTargetDate: Date | null;
  /** Reports its outcome, so a toggle that could not be applied says so. */
  toggleAction: () => Promise<GoalActionState>;
  updateAction: FormAction;
  duplicateAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  // Shown the instant the checkbox is clicked, before the server round trip
  // that used to be the only thing that ever changed it -- that gap was the
  // "click takes half a second" complaint. Reconciles itself once the real
  // `milestone.completed` prop catches up (success), or reverts on its own
  // once the transition below settles without it having moved (failure);
  // either way `toggleError` explains a failure the button already undid.
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(milestone.completed);
  const [isToggling, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const completed = optimisticCompleted;
  // Gates the pop animation below to an actual toggle in this session, rather
  // than `completed` itself -- that would also be true the instant a goal
  // with already-completed milestones first renders, playing the animation
  // on every page load instead of only when someone just completed one.
  const [justToggled, setJustToggled] = useState(false);
  // Both the checkbox and the Undo button drive the same toggle, so they share
  // one result: whichever was pressed, the reason it failed shows on this row.
  const recurrence = recurrenceFromColumns(milestone);
  // KD-056: "Done. Next due …" after ticking a repeating milestone, which
  // stays open with its date moved on -- or, for its last occurrence before
  // the goal's target date, that the milestone is now complete.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  function handleToggle() {
    startToggle(async () => {
      setOptimisticCompleted(!milestone.completed);
      setJustToggled(true);
      setToggleError(null);
      const result = await toggleAction();
      if (result.error) setToggleError(result.error);
      if (result.nextDueDate) setToast({ id: Date.now(), message: `Done. Next due ${formatDate(result.nextDueDate, locale)}.` });
      if (result.finished) setToast({ id: Date.now(), message: "Last one done. Milestone completed." });
    });
  }
  const [autoCompletionFeedback, setAutoCompletionFeedback] = useState<FeedbackState>(() => autoCompletionFeedbackState(milestone.autoCompleted, milestone.completedAt));
  const today = useToday();
  const overdue = !completed && Boolean(milestone.dueDate && milestone.dueDate < today);
  const { locale } = useFormatPreferences();
  const date = milestone.dueDate ? formatDate(milestone.dueDate, locale) : undefined;
  const completedDate = milestone.completedAt ? formatDate(milestone.completedAt, locale) : undefined;
  const latestDueDate = goalTargetDate ? formatDateInput(addUtcDays(goalTargetDate, -1)) : undefined;
  // The measure can be removed while this row is on screen; until the value is
  // cleared with it, the number left behind counts nothing.
  const measuredValue = hasTarget ? milestone.value : null;
  const title = `${milestone.name}${measuredValue === null ? "" : ` ${displayNumber(measuredValue, unit, locale)}`}`;

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

  if (editing) return <MilestoneEditForm milestone={{ ...milestone, recurrence }} hasTarget={hasTarget} unit={unit} latestDueDate={latestDueDate} goalTargetDate={goalTargetDate} updateAction={updateAction} onDone={() => setEditing(false)} />;

  return <div role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setEditing(true); }} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition hover:border-violet-200 hover:bg-violet-50/30 ${completed ? "border-emerald-100 bg-emerald-50/60" : "border-zinc-200"}`}>
    <button type="button" disabled={isToggling} onClick={(event) => { event.stopPropagation(); handleToggle(); }} aria-label={completed ? "Reopen milestone" : "Complete milestone"} aria-pressed={completed} className="-m-2 rounded-full p-2 text-zinc-400 transition active:scale-90 disabled:opacity-70">{completed ? <Check key="done" className={`h-6 w-6 rounded-full bg-emerald-500 p-1 text-white ${justToggled ? "checkbox-pop" : ""}`}/> : <Circle key="open" className="h-6 w-6"/>}</button>
    <div className="min-w-0 flex-1">
      <p className={`font-medium ${completed ? "text-zinc-500 line-through" : "text-zinc-900"}`}>{title}</p>
      {completed ? <p className="mt-1 text-xs font-medium text-emerald-700">Completed{completedDate ? ` ${completedDate}` : ""}</p> : milestone.dueDate && <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${overdue ? "text-red-600" : "text-zinc-500"}`}>{overdue ? <TriangleAlert className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}{date} · {formatDeadline(milestone.dueDate, today)}</p>}
      {recurrence && <RepeatSummary recurrence={recurrence} dueDate={milestone.dueDate} completed={completed} doneCount={milestone.completedOccurrences} goalTargetDate={goalTargetDate} locale={locale} />}
      {toggleError && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{toggleError}</p>}
      {toast && <Snackbar key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />}
      {autoCompletionFeedback !== "hidden" && <div role="status" className={`mt-3 flex w-fit items-center gap-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-all duration-500 ${autoCompletionFeedback === "fading" ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"}`}>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 bg-amber-400" />Completed automatically</span>
        <button type="button" disabled={isToggling} onClick={(event) => { event.stopPropagation(); handleToggle(); }} className="inline-flex items-center gap-1 font-semibold hover:text-amber-950 disabled:opacity-70"><RotateCcw className="h-3.5 w-3.5"/> Undo</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); dismissAutoCompletionFeedback(); }} aria-label="Dismiss automatic completion message" className="p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-800"><X className="h-3.5 w-3.5" /></button>
      </div>}
    </div>
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary aria-label="Milestone actions" className="list-none rounded-lg p-2 text-zinc-400 hover:bg-white hover:text-zinc-700"><Ellipsis className="h-5 w-5" /></summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 text-sm shadow-lg">
        <button type="button" onClick={() => setEditing(true)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-50">Edit milestone</button>
        <form autoComplete="off" spellCheck={false} action={duplicateAction}><SubmitButton className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-50">Duplicate</SubmitButton></form>
        <form autoComplete="off" spellCheck={false} action={deleteAction}><SubmitButton className="w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">Delete</SubmitButton></form>
      </div>
    </details>
  </div>;
}

/**
 * A repeating milestone's extra line (KD-056): its rule and how many times
 * it's been done, then the next occurrence -- or, when the next one would
 * land on or after the goal's target date, that this is the last one.
 */
function RepeatSummary({ recurrence, dueDate, completed, doneCount, goalTargetDate, locale }: { recurrence: Recurrence; dueDate: Date | null; completed: boolean; doneCount: number; goalTargetDate: Date | null; locale: string }) {
  const next = !completed && dueDate ? followingOccurrence(dueDate, recurrence) : null;
  const isLast = Boolean(next && goalTargetDate && next >= goalTargetDate);
  return <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-medium text-zinc-500">
    <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />{recurrenceLabel(recurrence)}</span>
    {doneCount > 0 && <span>Done {doneCount} {doneCount === 1 ? "time" : "times"}</span>}
    {next && <span>{isLast ? "Last one before the target date" : `Next event: ${formatDate(next, locale)}`}</span>}
  </p>;
}

/**
 * Mounted only while editing, so a fresh `useActionState` starts each time the
 * row is opened. Kept in the parent, `state.saved` would flip false to true
 * exactly once and stay true across every later save in the same session --
 * the effect below fires on that transition, so a second edit in the same
 * session would save silently with no form closing to show for it.
 */
function MilestoneEditForm({ milestone, hasTarget, unit, latestDueDate, goalTargetDate, updateAction, onDone }: {
  milestone: { name: string; value: number | null; dueDate: Date | null; recurrence: Recurrence | null };
  hasTarget: boolean;
  unit: string | null;
  latestDueDate: string | undefined;
  goalTargetDate: Date | null;
  updateAction: FormAction;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateAction, initialState);
  const [dueDate, setDueDate] = useState(milestone.dueDate ? formatDateInput(milestone.dueDate) : "");
  const [targetValue, setTargetValue] = useState(milestone.value !== null ? String(milestone.value) : "");
  const repeat = useMilestoneRepeat({ initial: milestone.recurrence, dueDate, valueEntered: hasTarget && targetValue.trim() !== "", goalTargetDate });
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return <form autoComplete="off" spellCheck={false} action={formAction} className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Same phone layout as the "New milestone" form: full-width lines with the unit and "by" inside their boxes, and the name never squashed by a column-direction `flex-1`. */}
      <input name="name" required autoFocus defaultValue={milestone.name} aria-label="Milestone title" className="h-11 w-full min-w-0 shrink-0 rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-violet-400 sm:w-auto sm:flex-1" />
      {hasTarget && <MilestoneValueField value={targetValue} onChange={setTargetValue} unit={unit} />}
      <div className="flex items-center gap-2">
        <span className="hidden shrink-0 px-1 text-sm font-medium uppercase text-zinc-700 sm:inline">by</span>
        <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
          <DueDateField value={dueDate} onChange={setDueDate} max={latestDueDate} ariaLabel="Optional due date" addon={repeat.button} lead="By" />
        </div>
      </div>
      <button disabled={pending} className="h-11 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={onDone} aria-label="Cancel editing" className="rounded-lg p-2 text-zinc-400 hover:bg-white"><X className="h-5 w-5" /></button>
    </div>
    <div className="mt-3">{repeat.fields}</div>
    {state.error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{state.error}</p>}
  </form>;
}
