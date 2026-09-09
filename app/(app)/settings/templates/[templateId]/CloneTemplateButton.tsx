"use client";

import { useActionState, useState } from "react";
import { Copy, X } from "lucide-react";
import { cloneTemplateAction, type TemplateActionState } from "../actions";
import { FIELD_INPUT_CLASS } from "@/components/custom-fields/field-styles";
import { Z_INDEX } from "@/lib/layout/z-index";

const initialState: TemplateActionState = {};

export function CloneTemplateButton({ templateId, templateName }: { templateId: string; templateName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cloneTemplateAction.bind(null, templateId), initialState);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"><Copy className="h-4 w-4" /> Clone</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="clone-template-title" className={`fixed inset-0 ${Z_INDEX.overlay} flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm`} onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><h2 id="clone-template-title" className="text-xl font-semibold">Clone {templateName}</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <p className="mt-2 text-sm text-zinc-500">Copies the current field list into a new, independent template.</p>
        <form action={formAction} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Name<input name="name" required autoFocus maxLength={60} defaultValue={`Copy of ${templateName}`} className={`mt-2 ${FIELD_INPUT_CLASS}`} /></label>
          {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-3 pt-1"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><button disabled={pending} className="rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Cloning…" : "Clone template"}</button></div>
        </form>
      </div>
    </div>}
  </>;
}
