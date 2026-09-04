"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDateInput, formatFutureDate, formatShortMonthYear } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import type { GoalActionState } from "../actions";

const initialState: GoalActionState = {};

type TargetDateAction = (state: GoalActionState, data: FormData) => Promise<GoalActionState>;

/**
 * The goal's target date, edited in place.
 *
 * It reads as the headline's own text rather than a control, because a button
 * here would compete with the goal's name; the hover highlight and the tooltip
 * carry the affordance instead. Click opens it -- the same single click the
 * milestone due date below it uses -- and so does Enter or Space, which keeps
 * it off the mouse alone.
 *
 * Saving needs nothing more than the action: the target date is read fresh by
 * goal health, the calendar's pin, the milestone forms' bound, and by
 * `activeGoalWhere` deciding whether this goal still reminds at all -- so
 * revalidating the routes is the whole of "recalculate everywhere".
 */
export function GoalTargetDate({ targetDate, earliestAllowed, action }: {
  targetDate: Date | null;
  /** The day after the latest milestone due date: pulling the target in past one would orphan it. */
  earliestAllowed: Date | null;
  action: TargetDateAction;
}) {
  const [editing, setEditing] = useState(false);
  const { locale } = useFormatPreferences();
  const close = useCallback(() => setEditing(false), []);

  if (editing) {
    return <TargetDateForm targetDate={targetDate} earliestAllowed={earliestAllowed} action={action} onDone={close} />;
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Opening puts an autofocused date input where this button was, within
        // the same keystroke. Enter's default activation would then land on
        // that input and submit the form before anything has been typed, so
        // the key is handled here and its default stopped.
        event.preventDefault();
        setEditing(true);
      }}
      title="Change the target date"
      className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-sm text-zinc-300 transition hover:bg-white/10"
    >
      <CalendarDays className="h-4 w-4" />
      {targetDate ? (
        <>
          <span>Target · {formatShortMonthYear(targetDate, locale)}</span>
          <span className="text-zinc-600">•</span>
          <strong className="font-medium text-violet-300">{formatFutureDate(targetDate, new Date())}</strong>
        </>
      ) : (
        <span>No target date</span>
      )}
    </button>
  );
}

function TargetDateForm({ targetDate, earliestAllowed, action, onDone }: {
  targetDate: Date | null;
  earliestAllowed: Date | null;
  action: TargetDateAction;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <CalendarDays className="h-4 w-4 text-zinc-300" />
      <input
        name="targetDate" type="date" autoFocus
        min={earliestAllowed ? formatDateInput(earliestAllowed) : undefined}
        aria-label="Goal target date"
        title={earliestAllowed ? "Must be after every milestone due date" : undefined}
        defaultValue={targetDate ? formatDateInput(targetDate) : ""}
        className="h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-sm text-white outline-none focus:border-violet-300"
      />
      <button disabled={pending} className="h-9 rounded-lg bg-white px-3 text-sm font-semibold text-zinc-900 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={onDone} className="h-9 px-2 text-sm font-medium text-zinc-400 hover:text-zinc-200">Cancel</button>
      {state.error && <p role="alert" className="w-full text-sm font-medium text-amber-300">{state.error}</p>}
    </form>
  );
}
