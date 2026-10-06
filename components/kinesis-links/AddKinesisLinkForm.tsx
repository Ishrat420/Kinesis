"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { DirectionField, TargetPicker } from "./KinesisLinks";
import type { KinesisLinkActionState } from "@/app/actions";
import type { LinkableObject } from "@/lib/objects/locations";

const INPUT_CLASS = "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10 sm:text-sm";

/**
 * "Add link" for a record whose Kinesis Links live in their own section
 * rather than inside a custom-fields editor (a Finance item's). The same
 * relationship picker and searchable target picker as "Add custom field →
 * Kinesis Link", saving immediately through `addKinesisLinkAction`; a real
 * <form> here, since nothing encloses it.
 */
export function AddKinesisLinkForm({ action, options }: {
  action: (state: KinesisLinkActionState, data: FormData) => Promise<KinesisLinkActionState>;
  options: LinkableObject[];
}) {
  const [open, setOpen] = useState(false);
  // Remounting the form after each add clears both pickers for the next one.
  const [formKey, setFormKey] = useState(0);
  const [state, submit, pending] = useActionState(action, {});
  const router = useRouter();

  // A successful add closes the form and refreshes, so the new link appears
  // in the list straight away.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
      setFormKey((key) => key + 1);
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-dashed border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-600 outline-none transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-300"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />Add link
      </button>
    );
  }

  return (
    <form key={formKey} action={submit} className="grid gap-3 rounded-xl border-[1.5px] border-dashed border-zinc-300 bg-white p-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
      <DirectionField className={INPUT_CLASS} />
      <TargetPicker options={options} className={INPUT_CLASS} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} aria-label="Add link" className="flex h-[50px] w-[50px] items-center justify-center rounded-xl bg-zinc-950 text-white outline-none transition disabled:opacity-60">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel adding a link" className="flex h-[50px] w-[50px] items-center justify-center rounded-xl text-zinc-400 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-zinc-300">
          <Minus className="h-4 w-4" />
        </button>
      </div>
      {state.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{state.error}</p>}
    </form>
  );
}
