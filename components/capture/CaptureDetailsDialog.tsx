"use client";

import { ListTodo, X } from "lucide-react";
import { Modal } from "@/components/overlay/Modal";
import { TodoDetailsForm, type CaptureDetailsDefaults } from "@/components/capture/TodoDetailsForm";

export type { CaptureDetailsDefaults };

/**
 * The optional second step of a capture (KD-008), as a modal.
 *
 * "Turn into" is the first field because it decides the rest: the fields below
 * it are exactly those the chosen target can hold. That is what stops the
 * failure KD-008 names -- entering a due date and then turning the capture into
 * something that has no such thing -- and when a value really cannot travel,
 * this says so before the user commits rather than dropping it quietly.
 *
 * The fields themselves live in `TodoDetailsForm`, shared with the To-Do's own
 * detail page/window (KD-048) -- this component only supplies the `Modal`
 * chrome and header around it.
 */
export function CaptureDetailsDialog({
  todo,
  defaults = {},
  onClose,
}: {
  todo: { id: string; name: string };
  defaults?: CaptureDetailsDefaults;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="capture-details-title" onClose={onClose} customHeader panelClassName="p-0 sm:max-w-md !rounded-t-2xl sm:!rounded-2xl">
      <div className="flex items-center gap-3 px-2.5 py-4 sm:px-5 sm:py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
          <ListTodo className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="capture-details-title" className="flex-1 truncate text-xl font-bold text-zinc-900 sm:text-2xl">
          {todo.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="shrink-0 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <TodoDetailsForm todo={todo} defaults={defaults} onClose={onClose} />
    </Modal>
  );
}
