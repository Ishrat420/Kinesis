"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteCustomModuleAction } from "../actions";

export function DeleteModuleButton({ moduleId, moduleName, itemCount }: { moduleId: string; moduleName: string; itemCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const action = deleteCustomModuleAction.bind(null, moduleId);

  if (itemCount === 0) return <form action={action}><button type="submit" aria-label={`Delete ${moduleName}`} title="Delete module" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button></form>;

  return <>
    <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${moduleName}`} title="Delete module" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
    {confirming && <div role="dialog" aria-modal="true" aria-labelledby="delete-module-title" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setConfirming(false)}>
      <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></span><h2 id="delete-module-title" className="mt-5 text-2xl font-semibold tracking-tight">Delete {moduleName}?</h2></div><button type="button" aria-label="Close" onClick={() => setConfirming(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <p className="mt-3 leading-6 text-zinc-500">Deleting this module will permanently delete all {itemCount} {itemCount === 1 ? "item" : "items"} in it. Are you sure you want to continue?</p>
        <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setConfirming(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><form action={action}><button className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700">Yes, delete module</button></form></div>
      </div>
    </div>}
  </>;
}
