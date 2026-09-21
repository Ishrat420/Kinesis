"use client";

import { useActionState, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Plus, Target, X } from "lucide-react";
import { createGoalAction, type GoalActionState } from "./actions";
import { CreateGoalSubmit } from "./CreateGoalSubmit";
import { CAPTURE_SOURCE_PARAM } from "@/lib/capture/targets";
import type { CaptureParams } from "@/lib/capture/params";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import { Modal } from "@/components/overlay/Modal";
import { NOTES_LIMIT } from "@/lib/validation/field-limits";

const initialState: GoalActionState = {};

/**
 * Every field in this form shares a real border and real size at rest --
 * 50px tall, so it reads as a field before it's been touched, not just once
 * focused -- in Goals' own violet (matching the module's colour everywhere
 * else it appears -- the sidebar, quick capture). `text-base sm:text-sm`
 * keeps mobile Safari from zooming in on focus.
 */
const FIELD_CLASS =
  "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 sm:text-sm";
const FIELD_LABEL_CLASS = "mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900";

/**
 * `capture` arrives when quick capture sent the user here to turn something they
 * wrote into a goal (KD-008D). The dialog opens with the title -- and the due
 * date, which a goal carries as its target date -- already in place.
 */
export function CreateGoalButton({ capture }: { capture?: CaptureParams }) {
  const [open, setOpen] = useState(Boolean(capture));
  const [state, formAction] = useActionState(createGoalAction, initialState);
  const [targetDate, setTargetDate] = useState(capture?.dueDate ?? "");
  const [dateFocused, setDateFocused] = useState(false);
  const { locale } = useFormatPreferences();
  const dateInputRef = useRef<HTMLInputElement>(null);

  return <>
    <button onClick={() => setOpen(true)} className="flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> Create goal</button>
    {open && (
      <Modal labelledBy="create-goal-title" onClose={() => setOpen(false)} customHeader panelClassName="p-0 sm:max-w-lg !rounded-t-2xl sm:!rounded-2xl">
        <div className="flex items-center gap-3 px-2.5 py-4 sm:px-5 sm:py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Target className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 id="create-goal-title" className="text-xl font-bold text-zinc-900 sm:text-2xl">Create a goal</h2>
            <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">Start simple. You can add the path forward next.</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close dialog" className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button>
        </div>

        <form action={formAction}>
          <div className="space-y-4 px-2.5 py-5 sm:px-5">
            {capture?.from && <input type="hidden" name={CAPTURE_SOURCE_PARAM} value={capture.from} />}

            <div>
              <label htmlFor="goal-name" className={FIELD_LABEL_CLASS}>
                Goal name <span className="font-bold text-red-500">*</span>
              </label>
              <input id="goal-name" name="name" required autoFocus defaultValue={capture?.title} placeholder="e.g. Buy my first home" className={FIELD_CLASS} />
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>
                Target date <span className="font-normal text-zinc-400">optional</span>
              </label>
              <div
                onClick={() => dateInputRef.current?.showPicker?.()}
                className={`relative flex h-[50px] cursor-pointer items-center gap-2 rounded-xl border-[1.5px] bg-white px-3.5 transition ${
                  dateFocused ? "border-violet-500 ring-4 ring-violet-500/15" : "border-zinc-200"
                }`}
              >
                <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className={`flex-1 truncate text-base sm:text-sm ${targetDate ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
                  {targetDate ? formatDate(targetDate, locale) : "Select a date"}
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  ref={dateInputRef}
                  type="date"
                  name="targetDate"
                  aria-label="Target date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  onFocus={() => setDateFocused(true)}
                  onBlur={() => setDateFocused(false)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL_CLASS}>
                Note <span className="font-normal text-zinc-400">optional</span>
              </label>
              <textarea name="note" rows={3} maxLength={NOTES_LIMIT} placeholder="Why this matters, or a first thought…" className={`min-h-[92px] resize-y px-3.5 py-3 leading-relaxed ${FIELD_CLASS}`} />
            </div>

            {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
          </div>

          <div className="flex flex-col-reverse gap-2 px-2.5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-5 sm:pt-5 sm:pb-5">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border-[1.5px] border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 sm:h-10">Cancel</button>
            <CreateGoalSubmit />
          </div>
        </form>
      </Modal>
    )}
  </>;
}
