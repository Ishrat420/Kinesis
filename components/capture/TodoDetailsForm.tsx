"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import type { TodoStatus } from "@prisma/client";
import { KinesisLinkList } from "@/components/custom-fields/KinesisLinkField";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import type { ObjectLocation } from "@/lib/objects/locations";
import { TODO_STATUSES, todoStatusDotClass, todoStatusLabel } from "@/lib/todos/status";
import { captureTargets, captureTargetCarries, DEFAULT_CAPTURE_TARGET, splitCaptureDetails, type CaptureDetail, type CaptureTargetType } from "@/lib/capture/targets";
import { captureLinkOptionsAction, saveTodoDetailsAction, type TodoDetailsState } from "@/app/(app)/todos/actions";
import { NOTES_LIMIT } from "@/lib/validation/field-limits";

const initialState: TodoDetailsState = {};

/** How a dropped detail is described to the user, in the terms they entered it. */
const DETAIL_LABELS: Record<CaptureDetail, string> = { status: "status", dueDate: "due date", link: "link" };

/**
 * Every field in this form shares a real border and real size at rest --
 * 50px tall, so it reads as a field before it's been touched, not just once
 * focused -- in To-Do's own teal, the same treatment AddTodoButton uses.
 * `text-base sm:text-sm` keeps mobile Safari from zooming in on focus.
 */
const FIELD_CLASS =
  "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15 sm:text-sm";
const FIELD_LABEL_CLASS = "mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900";

export type CaptureDetailsDefaults = { status?: TodoStatus; dueDate?: string; notes?: string; linkObjectIds?: string[] };

/**
 * The fields of a capture's optional second step (KD-008) -- extracted from
 * `CaptureDetailsDialog` so a To-Do's own detail page/window (KD-048) can
 * reuse the exact same form for its inline edit mode, the way Finance's
 * `FinanceForm` is shared between its dashboard modal and its detail page.
 * `CaptureDetailsDialog` now just supplies the `Modal` chrome around this.
 *
 * `allowConvert` hides "Turn into": on the quick-capture triage dialog it's
 * the whole point (deciding what a bare capture becomes), but on a To-Do's
 * own permanent page -- a record you're already viewing as a To-Do -- it
 * doesn't fit the same "edit this record" mental model, so the detail page
 * passes `allowConvert={false}`.
 */
export function TodoDetailsForm({
  todo,
  defaults = {},
  onClose,
  allowConvert = true,
}: {
  todo: { id: string; name: string };
  defaults?: CaptureDetailsDefaults;
  onClose: () => void;
  allowConvert?: boolean;
}) {
  const [linkOptions, setLinkOptions] = useState<ObjectLocation[] | null>(null);
  const [target, setTarget] = useState<CaptureTargetType>(DEFAULT_CAPTURE_TARGET);
  const [status, setStatus] = useState<TodoStatus>(defaults.status ?? "TODO");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [dateFocused, setDateFocused] = useState(false);
  const [notes, setNotes] = useState(defaults.notes ?? "");
  const [linkObjectIds, setLinkObjectIds] = useState<string[]>(defaults.linkObjectIds ?? []);
  const [state, formAction, pending] = useActionState(saveTodoDetailsAction.bind(null, todo.id), initialState);
  const { locale } = useFormatPreferences();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { dropped } = splitCaptureDetails(target, { status: status === "TODO" ? "" : status, dueDate, link: linkObjectIds.length ? "linked" : "" });
  const stayingATodo = target === DEFAULT_CAPTURE_TARGET;

  // Loaded on open rather than passed in, so no page pays for a picker it never
  // shows. `active` drops a response that arrives after the form closes.
  useEffect(() => {
    let active = true;
    captureLinkOptionsAction().then((options) => { if (active) setLinkOptions(options); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);

  return (
    <form action={formAction}>
      <div className="space-y-4 px-2.5 py-5 sm:px-5">
        <input type="hidden" name="name" value={todo.name} />
        <input type="hidden" name="target" value={target} />

        {allowConvert && (
          <div>
            <label htmlFor="capture-target" className={FIELD_LABEL_CLASS}>Turn into</label>
            <div className="relative">
              <select
                id="capture-target"
                value={target}
                onChange={(event) => setTarget(event.target.value as CaptureTargetType)}
                className={`appearance-none pr-9 ${FIELD_CLASS}`}
              >
                {captureTargets.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>
        )}

        {/*
          Not a select of its own: pointing at another record is the same act as
          a Kinesis Link custom field, so it uses the same control and the same
          card.
        */}
        {captureTargetCarries(target, "link") && (
          <div>
            <label className={FIELD_LABEL_CLASS}>
              Kinesis Link <span className="font-normal text-zinc-400">optional</span>
            </label>
            <KinesisLinkList
              name="linkObjectId"
              options={linkOptions ?? []}
              values={linkObjectIds}
              onChange={setLinkObjectIds}
              ariaLabel="Link this to"
              placeholder="Nothing yet"
              addPlaceholder="Link something else"
              loading={linkOptions === null}
            />
          </div>
        )}

        {captureTargetCarries(target, "status") && (
          <div>
            <label htmlFor="capture-status" className={FIELD_LABEL_CLASS}>Status</label>
            <div className="relative">
              <span aria-hidden="true" className={`pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${todoStatusDotClass(status)}`} />
              <select
                id="capture-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as TodoStatus)}
                className={`appearance-none pl-8 pr-9 ${FIELD_CLASS}`}
              >
                {TODO_STATUSES.map((option) => <option key={option} value={option}>{todoStatusLabel(option)}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>
        )}

        {captureTargetCarries(target, "dueDate") && (
          <div>
            <label className={FIELD_LABEL_CLASS}>
              {stayingATodo ? "Due" : "Target date"} <span className="font-normal text-zinc-400">optional</span>
            </label>
            <div
              onClick={() => dateInputRef.current?.showPicker?.()}
              className={`relative flex h-[50px] cursor-pointer items-center gap-2 rounded-xl border-[1.5px] bg-white px-3.5 transition ${
                dateFocused ? "border-teal-600 ring-4 ring-teal-600/15" : "border-zinc-200"
              }`}
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className={`flex-1 truncate text-base sm:text-sm ${dueDate ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
                {dueDate ? formatDate(dueDate, locale) : "Select a date"}
              </span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                ref={dateInputRef}
                type="date"
                name="dueDate"
                aria-label={stayingATodo ? "Due date" : "Target date"}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                onFocus={() => setDateFocused(true)}
                onBlur={() => setDateFocused(false)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        )}

        {stayingATodo && (
          <div>
            <label className={FIELD_LABEL_CLASS}>
              Notes <span className="font-normal text-zinc-400">optional</span>
            </label>
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={NOTES_LIMIT}
              className={`min-h-[92px] resize-y px-3.5 py-3 leading-relaxed ${FIELD_CLASS}`}
            />
          </div>
        )}

        {dropped.length > 0 && (
          <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            A {captureTargets.find((option) => option.type === target)?.label} has no {dropped.map((detail) => DETAIL_LABELS[detail]).join(" or ")}, so
            {dropped.length === 1 ? " that will not" : " those will not"} carry over.
          </p>
        )}

        {!stayingATodo && (
          <p className="text-sm text-zinc-500">
            Continuing opens the {captureTargets.find((option) => option.type === target)?.label.toLowerCase()} form with this title filled in. The To-Do stays until that record is created.
          </p>
        )}

        {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 px-2.5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-5 sm:pt-5 sm:pb-5">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-xl border-[1.5px] border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 sm:h-10"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
        >
          {stayingATodo && <Check className="h-4 w-4" aria-hidden="true" />}
          {pending ? "Saving…" : stayingATodo ? "Save changes" : "Continue"}
        </button>
      </div>
    </form>
  );
}
