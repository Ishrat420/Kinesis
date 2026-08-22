"use client";

import { useState } from "react";
import { CalendarDays, Link2, Minus, Plus, Save } from "lucide-react";
import { updateCustomItemAction } from "../../../actions";

type EditableItem = {
  id: string; name: string; notes: string; reminder: string; link: string; archived: boolean;
  fields: { id: string; label: string; value: string }[];
};

export function EditCustomItemForm({ moduleId, item, color }: { moduleId: string; item: EditableItem; color: string }) {
  const [fields, setFields] = useState(item.fields.length ? item.fields : []);
  const action = updateCustomItemAction.bind(null, moduleId, item.id);
  return <form action={action} className="space-y-5">
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <fieldset className="border-t border-zinc-100 pt-5"><div className="flex items-center justify-between"><legend className="font-semibold text-zinc-800">Custom fields</legend><button type="button" onClick={() => setFields((current) => [...current, { id: crypto.randomUUID(), label: "", value: "" }])} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "#52525b" }}><Plus className="h-4 w-4" /> Add field</button></div>
      {fields.length ? <div className="mt-3 space-y-2">{fields.map((field, index) => <div key={field.id} className="grid grid-cols-[1fr_1fr_40px] gap-2"><input name="fieldLabel" aria-label={`Field ${index + 1} name`} defaultValue={field.label} placeholder="Field name" className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"/><input name="fieldValue" aria-label={`Field ${index + 1} value`} defaultValue={field.value} placeholder="Value" className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"/><button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields((current) => current.filter(({ id }) => id !== field.id))} className="flex h-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"><Minus className="h-4 w-4"/></button></div>)}</div> : <p className="mt-3 text-sm text-zinc-400">No custom fields. Add one whenever you need it.</p>}
    </fieldset>
    <label className="block text-sm font-medium text-zinc-600">Notes<textarea name="notes" rows={4} defaultValue={item.notes} className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 p-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-zinc-600">Reminder<div className="relative mt-1.5"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="reminder" type="date" defaultValue={item.reminder} className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label><label className="block text-sm font-medium text-zinc-600">Link<div className="relative mt-1.5"><Link2 className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="link" type="url" defaultValue={item.link} placeholder="https://…" className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label></div>
    <label className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700"><span><span className="block">Archived</span><span className="font-normal text-zinc-400">Hide this item from the active list.</span></span><select name="archived" defaultValue={String(item.archived)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 outline-none"><option value="false">False</option><option value="true">True</option></select></label>
    <div className="flex justify-end border-t border-zinc-100 pt-5"><button className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-800" style={{ backgroundColor: color }}><Save className="h-4 w-4"/> Save changes</button></div>
  </form>;
}
