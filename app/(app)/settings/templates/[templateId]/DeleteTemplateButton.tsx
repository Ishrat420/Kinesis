"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { deleteTemplateAction, type TemplateActionState } from "../actions";
import { Z_INDEX } from "@/lib/layout/z-index";

const initialState: TemplateActionState = {};

export function DeleteTemplateButton({ templateId, templateName, locked }: { templateId: string; templateName: string; locked: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(deleteTemplateAction.bind(null, templateId), initialState);

  if (locked) return (
    <button
      type="button"
      disabled
      aria-label={`Delete ${templateName}`}
      title="This template is in use, so it can't be deleted."
      className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3.5 text-sm font-semibold text-zinc-300"
    >
      <Trash2 className="h-4 w-4" /> Delete
    </button>
  );

  return <>
    <button type="button" onClick={() => setConfirming(true)} className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3.5 text-sm font-semibold text-zinc-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /> Delete</button>
    {confirming && <div role="dialog" aria-modal="true" aria-labelledby="delete-template-title" className={`fixed inset-0 ${Z_INDEX.overlay} flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm`} onMouseDown={() => setConfirming(false)}>
      <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></span><h2 id="delete-template-title" className="mt-5 text-2xl font-semibold tracking-tight">Delete {templateName}?</h2></div><button type="button" aria-label="Close" onClick={() => setConfirming(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <p className="mt-3 leading-6 text-zinc-500">This permanently deletes the template and its field definitions. This can&rsquo;t be undone.</p>
        {state.error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{state.error}</p>}
        <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setConfirming(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><form action={formAction}><button disabled={pending} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70">{pending && <LoaderCircle className="h-4 w-4 animate-spin" />}{pending ? "Deleting…" : "Yes, delete template"}</button></form></div>
      </div>
    </div>}
  </>;
}
