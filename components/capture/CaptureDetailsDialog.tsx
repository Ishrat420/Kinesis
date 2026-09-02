"use client";

import { useActionState, useEffect, useState } from "react";
import type { TodoStatus } from "@prisma/client";
import { Modal } from "@/components/overlay/Modal";
import type { ObjectLocation } from "@/lib/objects/locations";
import { TODO_STATUSES, todoStatusLabel } from "@/lib/todos/status";
import { captureTargets, captureTargetCarries, DEFAULT_CAPTURE_TARGET, splitCaptureDetails, type CaptureDetail, type CaptureTargetType } from "@/lib/capture/targets";
import { captureLinkOptionsAction, saveTodoDetailsAction, type TodoDetailsState } from "@/app/(app)/todos/actions";

const initialState: TodoDetailsState = {};

/** How a dropped detail is described to the user, in the terms they entered it. */
const DETAIL_LABELS: Record<CaptureDetail, string> = { status: "status", dueDate: "due date", link: "link" };

export type CaptureDetailsDefaults = { status?: TodoStatus; dueDate?: string; linkObjectId?: string };

/**
 * The optional second step of a capture (KD-008).
 *
 * "Turn into" is the first field because it decides the rest: the fields below
 * it are exactly those the chosen target can hold. That is what stops the
 * failure KD-008 names -- entering a due date and then turning the capture into
 * something that has no such thing -- and when a value really cannot travel,
 * this says so before the user commits rather than dropping it quietly.
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
  const [linkOptions, setLinkOptions] = useState<ObjectLocation[] | null>(null);
  const [target, setTarget] = useState<CaptureTargetType>(DEFAULT_CAPTURE_TARGET);
  const [status, setStatus] = useState<TodoStatus>(defaults.status ?? "TODO");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [linkObjectId, setLinkObjectId] = useState(defaults.linkObjectId ?? "");
  const [state, formAction, pending] = useActionState(saveTodoDetailsAction.bind(null, todo.id), initialState);

  const { dropped } = splitCaptureDetails(target, { status: status === "TODO" ? "" : status, dueDate, link: linkObjectId });
  const stayingATodo = target === DEFAULT_CAPTURE_TARGET;

  // Loaded on open rather than passed in, so no page pays for a picker it never
  // shows. `active` drops a response that arrives after the dialog closes.
  useEffect(() => {
    let active = true;
    captureLinkOptionsAction().then((options) => { if (active) setLinkOptions(options); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);

  return (
    <Modal eyebrow="To-Do" title={todo.name} onClose={onClose}>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="name" value={todo.name} />
        <input type="hidden" name="target" value={target} />

        <label className="block text-sm font-semibold">
          Turn into
          <select
            value={target} onChange={(event) => setTarget(event.target.value as CaptureTargetType)}
            className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 font-normal outline-none transition focus:border-zinc-400"
          >
            {captureTargets.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
          </select>
        </label>

        {captureTargetCarries(target, "link") && (
          <label className="block text-sm font-semibold">
            Link to <span className="font-normal text-zinc-400">(optional)</span>
            <select
              name="linkObjectId" value={linkObjectId} disabled={linkOptions === null}
              onChange={(event) => setLinkObjectId(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 font-normal outline-none transition focus:border-zinc-400 disabled:text-zinc-400"
            >
              <option value="">{linkOptions === null ? "Loading…" : "Nothing yet"}</option>
              {(linkOptions ?? []).map((option) => <option key={option.objectId} value={option.objectId}>{option.name} — {option.module}</option>)}
            </select>
          </label>
        )}

        {captureTargetCarries(target, "status") && (
          <label className="block text-sm font-semibold">
            Status
            <select
              name="status" value={status} onChange={(event) => setStatus(event.target.value as TodoStatus)}
              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 font-normal outline-none transition focus:border-zinc-400"
            >
              {TODO_STATUSES.map((option) => <option key={option} value={option}>{todoStatusLabel(option)}</option>)}
            </select>
          </label>
        )}

        {captureTargetCarries(target, "dueDate") && (
          <label className="block text-sm font-semibold">
            {stayingATodo ? "Due" : "Target date"} <span className="font-normal text-zinc-400">(optional)</span>
            <input
              type="date" name="dueDate" value={dueDate} onChange={(event) => setDueDate(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 px-4 font-normal outline-none transition focus:border-zinc-400"
            />
          </label>
        )}

        {dropped.length > 0 && (
          <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
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

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100">Cancel</button>
          <button type="submit" disabled={pending} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60">
            {pending ? "Saving…" : stayingATodo ? "Save changes" : "Continue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
