"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Modal } from "@/components/overlay/Modal";
import { captureTodoAction } from "./actions";

/**
 * The in-page equivalent of the command bar's quick capture (KD-008A), for
 * anyone who lands on /todos without having reached for ⌘K.
 */
export function AddTodoButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await captureTodoAction(String(formData.get("name") ?? ""));
      if (result.error) return setError(result.error);
      close();
    });
  };

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

      {open && (
        <Modal labelledBy="add-todo-title" onClose={close} customHeader panelClassName="p-0 sm:max-w-md">
          <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-6">
            <div>
              <h2 id="add-todo-title" className="text-2xl font-semibold">
                Add a to-do
              </h2>
              <p className="mt-1 text-sm text-zinc-500">Capture what needs doing. You can add details afterwards.</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close add to-do dialog"
              className="rounded-full p-2 transition hover:bg-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form action={submit}>
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

              {error && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-200 px-8 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={close}
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
      )}
    </>
  );
}
