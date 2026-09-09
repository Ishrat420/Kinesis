"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateTemplateAction, type TemplateActionState } from "../actions";
import { TemplateFieldsEditor } from "../TemplateFieldsEditor";
import type { TemplateFieldInput } from "@/lib/templates/parse";
import { FIELD_INPUT_CLASS } from "@/components/custom-fields/field-styles";

const initialState: TemplateActionState = {};

export function TemplateDetailForm({ templateId, name, fields, locked }: {
  templateId: string;
  name: string;
  fields: TemplateFieldInput[];
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateTemplateAction.bind(null, templateId), initialState);
  const savedRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.saved) {
      const timeout = window.setTimeout(() => savedRef.current?.setAttribute("hidden", ""), 3000);
      return () => window.clearTimeout(timeout);
    }
  }, [state.saved]);

  return (
    <form action={formAction} className="space-y-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <label className="block text-sm font-semibold">Name<input name="name" defaultValue={name} required maxLength={60} className={`mt-2 ${FIELD_INPUT_CLASS}`} /></label>

      <TemplateFieldsEditor initialFields={fields} locked={locked} />

      {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-5">
        {state.saved && <p ref={savedRef} role="status" className="text-sm font-medium text-emerald-700">Saved</p>}
        <button disabled={pending} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-70">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
