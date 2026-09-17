"use client";

import { CalendarDays, Check, ChevronDown, ListTodo, Plus, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { TodoStatus } from "@prisma/client";
import { Modal } from "@/components/overlay/Modal";
import { KinesisLinkList } from "@/components/custom-fields/KinesisLinkField";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import type { ObjectLocation } from "@/lib/objects/locations";
import { TODO_STATUSES, todoStatusLabel } from "@/lib/todos/status";
import { createTodoAction, type CreateTodoState } from "./actions";

const initialState: CreateTodoState = {};

/**
 * The fill-at-rest, border-and-ring-only-on-focus treatment every field in
 * this form shares, in To-Do's own teal (matching the module's colour
 * everywhere else it appears -- the notification bell, quick capture).
 * `text-base sm:text-sm` keeps mobile Safari from zooming in on focus.
 */
const FIELD_CLASS =
  "h-11 w-full rounded-xl border-[1.5px] border-transparent bg-zinc-100 px-3 text-base text-zinc-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-600/15 sm:text-sm";
const FIELD_LABEL_CLASS = "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-900";

/**
 * The in-page equivalent of the command bar's quick capture (KD-008A), for
 * anyone who lands on /todos without reaching for ⌘K. Unlike quick capture
 * this asks for status, due date and Kinesis Link up front rather than
 * requiring a follow-up edit -- someone who opens this dialog already means
 * to create a To-Do, so there is no "Turn into" here; that stays on the
 * details dialog a To-Do gets edited through afterwards.
 */
export function AddTodoButton({ linkOptions }: { linkOptions: ObjectLocation[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 items-center gap-3 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-black"
      >
        <Plus className="h-[18px] w-[18px]" />
        Add to-do
      </button>

      {open && <AddTodoForm linkOptions={linkOptions} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Exported so a caller that already knows some of a to-do's details up front
 * -- Upcoming & Due's "create a to-do from this Important Date" action
 * (KD-047) -- can open this same dialog pre-filled instead of blank, rather
 * than building a second create form for the same fields.
 */
export function AddTodoForm({
  linkOptions,
  onClose,
  initialName = "",
  initialDueDate = "",
  initialLinkObjectIds = [],
}: {
  linkOptions: ObjectLocation[];
  onClose: () => void;
  initialName?: string;
  initialDueDate?: string;
  initialLinkObjectIds?: string[];
}) {
  const [status, setStatus] = useState<TodoStatus>("TODO");
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [dateFocused, setDateFocused] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkObjectIds, setLinkObjectIds] = useState<string[]>(initialLinkObjectIds);
  const [state, formAction, pending] = useActionState(createTodoAction, initialState);
  const { locale } = useFormatPreferences();

  useEffect(() => {
    if (state.created) onClose();
  }, [state.created, onClose]);

  return (
    <Modal labelledBy="add-todo-title" onClose={onClose} customHeader panelClassName="p-0 sm:max-w-md">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-6 py-5 sm:px-8 sm:py-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
          <ListTodo className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="add-todo-title" className="flex-1 text-xl font-bold text-zinc-900 sm:text-2xl">
          Add a to-do
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add to-do dialog"
          className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form action={formAction}>
        <div className="space-y-5 px-6 py-6 sm:px-8">
          <input
            name="name"
            required
            autoFocus
            defaultValue={initialName}
            placeholder="What do you need to do?"
            aria-label="What do you need to do?"
            className="w-full border-0 border-b-2 border-transparent bg-transparent pb-2 text-xl font-bold text-zinc-900 outline-none transition placeholder:font-semibold placeholder:text-zinc-400 focus:border-teal-600"
          />

          <div>
            <label htmlFor="todo-status" className={FIELD_LABEL_CLASS}>Status</label>
            <div className="relative">
              <select
                id="todo-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as TodoStatus)}
                className={`appearance-none pr-9 ${FIELD_CLASS}`}
              >
                {TODO_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {todoStatusLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS}>
              Due <span className="font-normal text-zinc-400">optional</span>
            </label>
            <div
              className={`relative flex h-11 items-center gap-2.5 rounded-xl border-[1.5px] px-3 transition ${
                dateFocused ? "border-teal-600 bg-white ring-4 ring-teal-600/15" : "border-transparent bg-zinc-100"
              }`}
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className={`flex-1 text-base sm:text-sm ${dueDate ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
                {dueDate ? formatDate(dueDate, locale) : "Select a date"}
              </span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                type="date"
                name="dueDate"
                aria-label="Due date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                onFocus={() => setDateFocused(true)}
                onBlur={() => setDateFocused(false)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS}>
              Kinesis Link <span className="font-normal text-zinc-400">optional</span>
            </label>
            <KinesisLinkList
              name="linkObjectId"
              options={linkOptions}
              values={linkObjectIds}
              onChange={setLinkObjectIds}
              ariaLabel="Link this to"
              placeholder="Nothing yet"
              addPlaceholder="Link something else"
            />
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS}>
              Notes <span className="font-normal text-zinc-400">optional</span>
            </label>
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Add any extra details…"
              className={`resize-none px-3 py-2.5 ${FIELD_CLASS}`}
            />
          </div>

          {state.error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {state.error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-8 sm:pt-5 sm:pb-5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 sm:h-10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {pending ? "Adding…" : "Add to-do"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
