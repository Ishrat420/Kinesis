"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { TodoStatus } from "@prisma/client";
import { Modal } from "@/components/overlay/Modal";
import { KinesisLinkList } from "@/components/custom-fields/KinesisLinkField";
import type { ObjectLocation } from "@/lib/objects/locations";
import { TODO_STATUSES, todoStatusLabel } from "@/lib/todos/status";
import { createTodoAction, type CreateTodoState } from "./actions";

const initialState: CreateTodoState = {};

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

function AddTodoForm({ linkOptions, onClose }: { linkOptions: ObjectLocation[]; onClose: () => void }) {
  const [status, setStatus] = useState<TodoStatus>("TODO");
  const [dueDate, setDueDate] = useState("");
  const [linkObjectIds, setLinkObjectIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(createTodoAction, initialState);

  useEffect(() => {
    if (state.created) onClose();
  }, [state.created, onClose]);

  return (
    <Modal labelledBy="add-todo-title" onClose={onClose} customHeader panelClassName="p-0 sm:max-w-md">
      <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
        <div>
          <h2 id="add-todo-title" className="text-2xl font-semibold">
            Add a to-do
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Capture what needs doing, with as much detail as you have.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add to-do dialog"
          className="rounded-full p-2 transition hover:bg-zinc-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form action={formAction}>
        <div className="space-y-5 p-8">
          <label className="block text-sm font-medium text-zinc-700">
            What do you need to do?
            <input
              name="name"
              required
              autoFocus
              placeholder="e.g. Renew car registration"
              className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-4 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Status
            <select
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as TodoStatus)}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 outline-none transition focus:border-zinc-400"
            >
              {TODO_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {todoStatusLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Due <span className="font-normal text-zinc-400">(optional)</span>
            <input
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-4 outline-none transition focus:border-zinc-400"
            />
          </label>

          <div className="text-sm font-medium text-zinc-700">
            Kinesis Link <span className="font-normal text-zinc-400">(optional)</span>
            <div className="mt-2">
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
          </div>

          {state.error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {state.error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 px-8 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add to-do"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
