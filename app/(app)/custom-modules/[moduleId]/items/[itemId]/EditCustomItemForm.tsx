"use client";

import { useActionState, useCallback, useState } from "react";
import { CalendarDays, CheckCircle2, Link2, LoaderCircle, Save } from "lucide-react";
import { updateCustomItemAction, type CustomItemState } from "../../../actions";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";

const initialState: CustomItemState = {};

type EditableItem = {
  id: string; name: string; notes: string; reminder: string; link: string; archived: boolean;
  fields: CustomFieldValue[];
};

export function EditCustomItemForm({ moduleId, item, linkOptions }: { moduleId: string; item: EditableItem; linkOptions: KinesisLinkOption[] }) {
  const [archived, setArchived] = useState(item.archived);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveItem = useCallback(async (previousState: CustomItemState, data: FormData) => {
    setSaveState("saving");
    const result = await updateCustomItemAction(moduleId, item.id, previousState, data);
    if (result.error) {
      setSaveState("idle");
      return result;
    }
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 3000);
    return result;
  }, [moduleId, item.id]);
  const [state, formAction] = useActionState(saveItem, initialState);
  return <form action={formAction} className="space-y-5">
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <div className="border-t border-zinc-100 pt-5"><CustomFieldsEditor initialFields={item.fields} linkOptions={linkOptions}/></div>
    <label className="block text-sm font-medium text-zinc-600">Notes<textarea name="notes" rows={4} defaultValue={item.notes} className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 p-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-zinc-600">Reminder<div className="relative mt-1.5"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="reminder" type="date" defaultValue={item.reminder} className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label><label className="block text-sm font-medium text-zinc-600">Link<div className="relative mt-1.5"><Link2 className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="link" type="url" defaultValue={item.link} placeholder="https://…" className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label></div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not Archived"}</button><input type="hidden" name="archived" value={String(archived)}/></div>
    {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    <div className="flex justify-end border-t border-zinc-100 pt-5"><button disabled={saveState === "saving"} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-70">{saveState === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin"/> : saveState === "saved" ? <CheckCircle2 className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save changes"}</button></div>
  </form>;
}
