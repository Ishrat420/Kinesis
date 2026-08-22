"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Link2, LoaderCircle, Minus, Plus, Save } from "lucide-react";
import { updateCustomItemAction } from "../../../actions";

type EditableItem = {
  id: string; name: string; notes: string; reminder: string; link: string; archived: boolean;
  fields: { id: string; label: string; value: string }[];
};

export function EditCustomItemForm({ moduleId, item }: { moduleId: string; item: EditableItem }) {
  const [fields, setFields] = useState(item.fields.length ? item.fields : []);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [archived, setArchived] = useState(item.archived);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const action = updateCustomItemAction.bind(null, moduleId, item.id);
  const saveItem = async (data: FormData) => {
    setSaveState("saving");
    await action(data);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 3000);
  };
  return <form action={saveItem} className="space-y-5">
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <fieldset className="border-t border-zinc-100 pt-5"><div className="flex items-center justify-between"><legend className="font-semibold text-zinc-800">Custom fields</legend><button type="button" onClick={() => { const id = crypto.randomUUID(); setFields((current) => [...current, { id, label: "", value: "" }]); setEditingLabel(id); }} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950"><Plus className="h-4 w-4" /> Add field</button></div>
      {fields.length ? <div className="mt-3 space-y-2">{fields.map((field, index) => <div key={field.id} className="grid grid-cols-[1fr_1fr_40px] gap-2">{editingLabel === field.id ? <input autoFocus aria-label={`Field ${index + 1} name`} value={field.label} placeholder="Field name" onChange={(event) => setFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} onBlur={() => setEditingLabel(null)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setEditingLabel(null); } }} className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"/> : <button type="button" onDoubleClick={() => setEditingLabel(field.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "F2") setEditingLabel(field.id); }} title="Double-click to rename" className="h-11 truncate px-3 text-left text-sm font-medium text-zinc-600 hover:text-zinc-950">{field.label || "Double-click to name field"}</button>}<input type="hidden" name="fieldLabel" value={field.label}/><input name="fieldValue" aria-label={`Field ${index + 1} value`} value={field.value} onChange={(event) => setFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} placeholder="Value" className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"/><button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields((current) => current.filter(({ id }) => id !== field.id))} className="flex h-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"><Minus className="h-4 w-4"/></button></div>)}</div> : <p className="mt-3 text-sm text-zinc-400">No custom fields. Add one whenever you need it.</p>}
    </fieldset>
    <label className="block text-sm font-medium text-zinc-600">Notes<textarea name="notes" rows={4} defaultValue={item.notes} className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 p-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-zinc-600">Reminder<div className="relative mt-1.5"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="reminder" type="date" defaultValue={item.reminder} className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label><label className="block text-sm font-medium text-zinc-600">Link<div className="relative mt-1.5"><Link2 className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="link" type="url" defaultValue={item.link} placeholder="https://…" className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label></div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not Archived"}</button><input type="hidden" name="archived" value={String(archived)}/></div>
    <div className="flex justify-end border-t border-zinc-100 pt-5"><button disabled={saveState === "saving"} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-70">{saveState === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin"/> : saveState === "saved" ? <CheckCircle2 className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save changes"}</button></div>
  </form>;
}
