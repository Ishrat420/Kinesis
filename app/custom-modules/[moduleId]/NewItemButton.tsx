"use client";

import { useState } from "react";
import { CalendarDays, Link2, Minus, Plus, X } from "lucide-react";
import { createCustomItemAction } from "../actions";

export function NewItemButton({ moduleId }: { moduleId: string }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState([crypto.randomUUID()]);
  const action = createCustomItemAction.bind(null, moduleId);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New item</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="new-item-title" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><h2 id="new-item-title" className="text-2xl font-semibold">Create a new item</h2><p className="mt-1 text-sm text-zinc-500">Add the essentials now. You can leave anything optional blank.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <form action={action} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold">Name<input required autoFocus name="name" maxLength={100} placeholder="Item name" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 px-4 font-normal outline-none focus:border-zinc-400" /></label>
          <fieldset><div className="flex items-center justify-between"><legend className="text-sm font-semibold">Custom fields</legend><button type="button" onClick={() => setFields((current) => [...current, crypto.randomUUID()])} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950"><Plus className="h-4 w-4" /> Add field</button></div><div className="mt-2 space-y-2">{fields.map((field, index) => <div key={field} className="grid grid-cols-[1fr_1fr_40px] gap-2"><input name="fieldLabel" aria-label={`Field ${index + 1} name`} placeholder="Field name" className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none" /><input name="fieldValue" aria-label={`Field ${index + 1} value`} placeholder="Value" className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none" /><button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields((current) => current.filter((id) => id !== field))} className="flex h-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"><Minus className="h-4 w-4" /></button></div>)}</div></fieldset>
          <label className="block text-sm font-semibold">Notes <span className="font-normal text-zinc-400">(optional)</span><textarea name="notes" rows={3} placeholder="Add any useful context…" className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 p-4 font-normal outline-none" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Reminder <span className="font-normal text-zinc-400">(optional)</span><div className="relative mt-2"><CalendarDays className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400"/><input name="reminder" type="date" className="h-12 w-full rounded-2xl border border-zinc-200 pl-12 pr-3 font-normal outline-none" /></div></label><label className="block text-sm font-semibold">Link <span className="font-normal text-zinc-400">(optional)</span><div className="relative mt-2"><Link2 className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400"/><input name="link" type="url" placeholder="https://…" className="h-12 w-full rounded-2xl border border-zinc-200 pl-12 pr-3 font-normal outline-none" /></div></label></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><button className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-black">Create item</button></div>
        </form>
      </div>
    </div>}
  </>;
}
