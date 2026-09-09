"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, LayoutTemplate, Link2, LoaderCircle, Save } from "lucide-react";
import { promoteFieldToTemplateAction, updateCustomItemAction, type CustomItemState } from "../../../actions";
import { CustomFieldsEditor } from "@/components/custom-fields/CustomFieldsEditor";
import { TemplateFieldValues, type TemplateFieldValue } from "@/components/custom-fields/TemplateFieldValues";
import type { CustomFieldValue, KinesisLinkOption } from "@/lib/custom-fields/types";

const initialState: CustomItemState = {};

type EditableItem = {
  id: string; name: string; notes: string; dueDate: string; link: string; archived: boolean;
  templateId: string | null; templateFields: TemplateFieldValue[]; fields: CustomFieldValue[];
};

export function EditCustomItemForm({ moduleId, item, linkOptions }: { moduleId: string; item: EditableItem; linkOptions: KinesisLinkOption[] }) {
  const [archived, setArchived] = useState(item.archived);
  // The action reports both halves of the outcome -- `pending` while it runs,
  // `saved` once it has -- so there is no separate save-state machine here to
  // keep in step with it.
  const [state, formAction, pending] = useActionState(updateCustomItemAction.bind(null, moduleId, item.id), initialState);
  // KD-038 Decision 6: the template's own Due Date field, when it has one,
  // takes over this slot entirely -- the fixed input never renders
  // alongside it, since both would be editing the same CustomItem.dueDate.
  const hasTemplateDueDate = item.templateFields.some((field) => field.isDueDate);

  return <form action={formAction} className="space-y-5">
    <label className="block text-sm font-medium text-zinc-600">Name<input required name="name" maxLength={100} defaultValue={item.name} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    {item.templateFields.length > 0 && <div className="border-t border-zinc-100 pt-5"><TemplateFieldValues key={item.templateFields.map((field) => field.templateFieldId).join(",")} fields={item.templateFields} linkOptions={linkOptions} /></div>}
    <div className="border-t border-zinc-100 pt-5">
      {/* Keyed off the extras actually present: "Add to template" moves a
          field out of this list out of band (its own action, not this
          form's save), so a fresh key here forces a resync to the object's
          current extras rather than continuing to show an already-promoted
          field as if it still needed editing here. */}
      <CustomFieldsEditor key={item.fields.map((field) => field.id).join(",")} initialFields={item.fields} linkOptions={linkOptions} />
      {item.templateId && item.fields.length > 0 && <PromoteFields moduleId={moduleId} itemId={item.id} fields={item.fields} />}
    </div>
    <label className="block text-sm font-medium text-zinc-600">Notes<textarea name="notes" rows={4} defaultValue={item.notes} className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 p-3 text-zinc-950 outline-none focus:border-zinc-400" /></label>
    <div className={hasTemplateDueDate ? "" : "grid gap-4 sm:grid-cols-2"}>
      {!hasTemplateDueDate && <label className="block text-sm font-medium text-zinc-600">Due date<div className="relative mt-1.5"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="dueDate" type="date" defaultValue={item.dueDate} className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label>}
      <label className="block text-sm font-medium text-zinc-600">Link<div className="relative mt-1.5"><Link2 className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input name="link" type="url" defaultValue={item.link} placeholder="https://…" className="h-11 w-full rounded-xl border border-zinc-200 pl-11 pr-3 text-zinc-950 outline-none focus:border-zinc-400"/></div></label>
    </div>
    <div className="flex justify-end"><button type="button" aria-pressed={archived} onClick={() => setArchived((current) => !current)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${archived ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{archived ? "Archived" : "Not Archived"}</button><input type="hidden" name="archived" value={String(archived)}/></div>
    {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    <div className="flex justify-end border-t border-zinc-100 pt-5"><button disabled={pending} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-70">{pending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : state.saved ? <CheckCircle2 className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{pending ? "Saving…" : state.saved ? "Saved" : "Save changes"}</button></div>
  </form>;
}

/**
 * Turns one of this item's own fields into a real field on the template it
 * follows (KD-035 Decision 4) -- a standalone action, not part of the form's
 * own save, since it changes the template itself and every other object
 * under it, not just this one.
 */
function PromoteFields({ moduleId, itemId, fields }: { moduleId: string; itemId: string; fields: CustomFieldValue[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const promote = (fieldId: string) => {
    setPendingId(fieldId);
    setError(null);
    startTransition(async () => {
      const result = await promoteFieldToTemplateAction(moduleId, itemId, fieldId);
      if (result.error) setError(result.error);
      else router.refresh();
      setPendingId(null);
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-400">Add to template:</span>
      {fields.flatMap((field) => field.id ? [
        <button
          key={field.id}
          type="button"
          disabled={isPending}
          onClick={() => promote(field.id!)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
        >
          {pendingId === field.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <LayoutTemplate className="h-3 w-3" />}
          {field.label}
        </button>,
      ] : [])}
      {error && <span role="alert" className="w-full text-xs font-medium text-red-600">{error}</span>}
    </div>
  );
}
