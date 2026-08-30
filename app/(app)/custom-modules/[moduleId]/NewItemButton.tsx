"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Link2, Plus, X } from "lucide-react";
import { createCustomItemAction } from "../actions";
import { ActionSubmitButton } from "../ActionSubmitButton";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import type { KinesisLinkOption } from "@/lib/custom-fields/types";

export function NewItemButton({ moduleId, linkOptions }: { moduleId: string; linkOptions: KinesisLinkOption[] }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const action = createCustomItemAction.bind(null, moduleId);
  const createItem = async (data: FormData) => {
    await action(data);
    setOpen(false);
    setCreated(true);
    window.setTimeout(() => setCreated(false), 3000);
  };
  return <>
    {created && <div role="status" className="fixed right-6 top-24 z-[60] flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-semibold text-emerald-700 shadow-lg"><CheckCircle2 className="h-5 w-5"/> Item created</div>}
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New item</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="new-item-title" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><h2 id="new-item-title" className="text-2xl font-semibold">Create a new item</h2><p className="mt-1 text-sm text-zinc-500">Add the essentials now. You can leave anything optional blank.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <form action={createItem} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold">Name<input required autoFocus name="name" maxLength={100} placeholder="Item name" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 px-4 font-normal outline-none focus:border-zinc-400" /></label>
          <CustomFieldsEditor linkOptions={linkOptions} />
          <label className="block text-sm font-semibold">Notes <span className="font-normal text-zinc-400">(optional)</span><textarea name="notes" rows={3} placeholder="Add any useful context…" className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 p-4 font-normal outline-none" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Reminder <span className="font-normal text-zinc-400">(optional)</span><div className="relative mt-2"><CalendarDays className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400"/><input name="reminder" type="date" className="h-12 w-full rounded-2xl border border-zinc-200 pl-12 pr-3 font-normal outline-none" /></div></label><label className="block text-sm font-semibold">Link <span className="font-normal text-zinc-400">(optional)</span><div className="relative mt-2"><Link2 className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400"/><input name="link" type="url" placeholder="https://…" className="h-12 w-full rounded-2xl border border-zinc-200 pl-12 pr-3 font-normal outline-none" /></div></label></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><ActionSubmitButton idleLabel="Create item" pendingLabel="Creating…" /></div>
        </form>
      </div>
    </div>}
  </>;
}
