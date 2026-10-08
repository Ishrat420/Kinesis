"use client";

import { ChevronDown, Repeat2 } from "lucide-react";
import { formatDate, parseDateOnly } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import { buildRecurrence, followingOccurrence, isRecurrenceRule, RECURRENCE_DAYS_MAX, RECURRENCE_OPTIONS, type Recurrence } from "@/lib/recurrence";

/**
 * Each module's own accent and field size: To-dos are teal at 50px,
 * goal milestones violet at 44px -- the same control either way (KD-056).
 */
const ACCENTS = {
  teal: { on: "border-teal-600 bg-teal-600 text-white hover:bg-teal-700", idle: "hover:text-teal-700", ring: "focus-visible:ring-teal-600/15" },
  violet: { on: "border-violet-600 bg-violet-600 text-white hover:bg-violet-700", idle: "hover:text-violet-700", ring: "focus-visible:ring-violet-500/15" },
} as const;
export type RepeatAccent = keyof typeof ACCENTS;
type RepeatSize = "md" | "sm";
const SIZES = { md: { button: "h-[50px] w-[50px]", field: "h-[50px]", nWidth: "grid-cols-[1.6fr_1fr]" }, sm: { button: "h-11 w-11", field: "h-11", nWidth: "grid-cols-[minmax(0,1fr)_72px]" } } as const;

/** The repeat button's and Repeats fields' in-progress state, as raw form strings. */
export type RepeatState = { on: boolean; rule: string; days: string };

/** Seeds the state from a to-do's stored rule (edit), or off (create). */
export function initialRepeat(recurrence?: Recurrence | null): RepeatState {
  return recurrence ? { on: true, rule: recurrence.rule, days: recurrence.days ? String(recurrence.days) : "" } : { on: false, rule: "", days: "" };
}

/**
 * The square ↻ button joined onto the right edge of a Due field (KD-056,
 * design option B). Pressed, it fills with the module's accent (teal for
 * To-dos, violet for goal milestones) and the Repeats fields appear
 * below the form's date row. With no due date there is nothing to repeat
 * from, so it is disabled -- the hover text sits on a wrapper because a
 * disabled button doesn't fire hover events in every browser.
 */
export function RepeatButton({ on, disabled, onToggle, accent = "teal", size = "md", disabledReason = "Pick a due date first" }: {
  on: boolean; disabled: boolean; onToggle: () => void; accent?: RepeatAccent; size?: RepeatSize;
  /** The hover text while disabled -- why it can't repeat right now. */
  disabledReason?: string;
}) {
  const title = disabled ? disabledReason : on ? "Stop repeating" : "Repeat";
  const colours = ACCENTS[accent];
  return (
    <span title={title} className="flex shrink-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        aria-label={title}
        className={`flex ${SIZES[size].button} items-center justify-center rounded-r-xl border-[1.5px] outline-none transition focus-visible:ring-4 ${colours.ring} ${
          on
            ? colours.on
            : disabled
              ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-300"
              : `border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 ${colours.idle}`
        }`}
      >
        <Repeat2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * Everything below the date row once the repeat button is on: the Repeats
 * dropdown, N for "Every N days", and a live "Next event" -- the same
 * inputs, options and wording as a custom item's Recurring Due Date
 * (KD-055). Always renders the hidden inputs the server reads (`repeat`,
 * `recurrenceRule`, `recurrenceDays`), so an off button submits as a one-off.
 */
export function RepeatFields({ repeat, onChange, dueDate, fieldClass, size = "md", className = "", lastBefore, footnote }: {
  repeat: RepeatState; onChange: (next: RepeatState) => void; dueDate: string; fieldClass: string; size?: RepeatSize; className?: string;
  /** An end date the repeat stops before (a goal's target date): a next event on or after it reads as the last one instead. */
  lastBefore?: Date | null;
  /** A short line under the inputs, e.g. "Repeats until 30 Dec 2026". */
  footnote?: string;
}) {
  const { locale } = useFormatPreferences();
  const active = repeat.on && Boolean(dueDate);
  const everyNDays = repeat.rule === "EVERY_N_DAYS";
  const nextEvent = active ? previewNextEvent(dueDate, repeat) : null;
  const isLast = Boolean(nextEvent && lastBefore && nextEvent >= lastBefore);

  return <>
    <input type="hidden" name="repeat" value={active ? "on" : ""} />
    <input type="hidden" name="recurrenceRule" value={active ? repeat.rule : ""} />
    <input type="hidden" name="recurrenceDays" value={active && everyNDays ? repeat.days : ""} />
    {active && (
      <div className={`space-y-2 ${className}`}>
        <div className={`grid min-w-0 gap-2.5 ${everyNDays ? SIZES[size].nWidth : "grid-cols-1"}`}>
          <div className="relative min-w-0">
            <select
              value={repeat.rule}
              onChange={(event) => onChange({ ...repeat, rule: event.target.value })}
              aria-label="Repeats"
              className={`${SIZES[size].field} appearance-none pl-3.5 pr-9 ${fieldClass}`}
            >
              <option value="">Repeats…</option>
              {RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          </div>
          {everyNDays && (
            <input
              type="number" inputMode="numeric" min={1} max={RECURRENCE_DAYS_MAX} step={1}
              value={repeat.days}
              onChange={(event) => onChange({ ...repeat, days: event.target.value })}
              aria-label="Repeat every how many days"
              placeholder={size === "sm" ? "N" : "N (days)"}
              className={`${SIZES[size].field} px-3.5 ${fieldClass}`}
            />
          )}
        </div>
        {(nextEvent || footnote) && (
          <div className="text-xs leading-5 text-zinc-500">
            {nextEvent && <p>{isLast ? "Last one before the target date" : `Next event: ${formatDate(nextEvent, locale)}`}</p>}
            {footnote && <p>{footnote}</p>}
          </div>
        )}
      </div>
    )}
  </>;
}

/** The occurrence after the entered date, once the date, the rule and (for "Every N days") a valid N are all in. */
function previewNextEvent(dueDate: string, repeat: RepeatState): Date | null {
  const date = parseDateOnly(dueDate);
  if (!date || !isRecurrenceRule(repeat.rule)) return null;
  let days: number | null = null;
  if (repeat.rule === "EVERY_N_DAYS") {
    days = /^\d+$/.test(repeat.days) ? Number(repeat.days) : NaN;
    if (!Number.isInteger(days) || days < 1 || days > RECURRENCE_DAYS_MAX) return null;
  }
  return followingOccurrence(date, buildRecurrence(repeat.rule, date, days));
}
