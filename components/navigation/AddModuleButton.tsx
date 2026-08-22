"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { createCustomModuleAction, type CreateModuleState } from "@/app/custom-modules/actions";
import { CUSTOM_MODULE_ICONS, CustomModuleIcon, type CustomModuleIconName } from "@/lib/custom-modules/icons";

const colors = ["#ede9fe", "#dbeafe", "#cffafe", "#d1fae5", "#ecfccb", "#fef3c7", "#ffe4e6", "#fce7f3", "#e4e4e7"];
const initialState: CreateModuleState = {};

export function AddModuleButton() {
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState<CustomModuleIconName>("package");
  const [color, setColor] = useState(colors[0]);
  const [state, formAction, pending] = useActionState(createCustomModuleAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.moduleId) router.push(`/custom-modules/${state.moduleId}`);
  }, [router, state.moduleId]);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-950">
      <Plus className="h-[18px] w-[18px]" /><span className="font-medium">Add Module</span>
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="create-module-title" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><h2 id="create-module-title" className="text-2xl font-semibold tracking-tight">Create a custom module</h2><p className="mt-1 text-sm text-zinc-500">Make a new area for anything you want to keep track of.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <form action={formAction} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold">Name<input name="name" required maxLength={60} autoFocus aria-invalid={state.field === "name"} aria-describedby={state.error ? "module-error" : undefined} placeholder="e.g. Skincare" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 px-4 font-normal outline-none focus:border-violet-500" /></label>
          <fieldset><legend className="text-sm font-semibold">Icon</legend><div className="mt-2 grid max-h-52 grid-cols-7 gap-2 overflow-y-auto pr-1">{Object.keys(CUSTOM_MODULE_ICONS).map((name) => <button key={name} type="button" title={name} aria-label={`${name} icon`} aria-pressed={icon === name} onClick={() => setIcon(name as CustomModuleIconName)} className={`flex aspect-square items-center justify-center rounded-xl border transition ${icon === name ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}><CustomModuleIcon name={name} className="h-5 w-5" /></button>)}</div><input type="hidden" name="icon" value={icon} /></fieldset>
          <fieldset><legend className="text-sm font-semibold">Colour</legend><div className="mt-2 flex flex-wrap items-center gap-2">{colors.map((swatch) => <button key={swatch} type="button" aria-label={`Select colour ${swatch}`} aria-pressed={color === swatch} onClick={() => setColor(swatch)} className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 ring-offset-2 transition hover:scale-105" style={{ backgroundColor: swatch, boxShadow: color === swatch ? "0 0 0 2px white, 0 0 0 4px #3f3f46" : undefined }}>{color === swatch && <Check className="h-4 w-4 text-zinc-700" />}</button>)}<label className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-dashed border-zinc-300" title="Custom colour"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="absolute -inset-2 h-14 w-14 cursor-pointer" /><span className="sr-only">Custom colour</span></label></div><input type="hidden" name="color" value={color} /></fieldset>
          <label className="block text-sm font-semibold">Description <span className="font-normal text-zinc-400">(optional)</span><textarea name="description" maxLength={240} rows={3} placeholder="What will you keep here?" className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 p-4 font-normal outline-none focus:border-violet-500" /></label>
          {state.error && <p id="module-error" role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</p>}
          <div className="flex justify-end gap-3 pt-1"><button type="button" onClick={() => setOpen(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><button disabled={pending} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Creating…" : "Create module"}</button></div>
        </form>
      </div>
    </div>}
  </>;
}
