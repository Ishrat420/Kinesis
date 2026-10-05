"use client";

import { useState, useTransition } from "react";
import { useReverification } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAllDataAction } from "./actions";
import { DELETE_ALL_CONFIRMATION } from "./constants";

/**
 * The whole "Delete your data" row, not just its button: confirming expands
 * this same card downward, under a divider, instead of nesting a second
 * tinted box inside it beside the row's own heading.
 */
export function DeleteDataButton() {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const verifiedDelete = useReverification(deleteAllDataAction);

  const cancel = () => { setConfirming(false); setConfirmation(""); setError(undefined); };
  const remove = () => startTransition(async () => {
    setError(undefined);
    const result = await verifiedDelete(confirmation);
    if ("error" in result) { setError(result.error); return; }
    router.push("/");
    router.refresh();
  });

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${confirming ? "border-red-200 bg-red-50/40" : "border-red-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50"><Trash2 className="h-4 w-4 text-red-600" /></span>
          <div><p className="text-sm font-medium text-red-700">Delete your data</p><p className="text-xs text-zinc-500">This action will permanently remove everything.</p></div>
        </div>
        {!confirming && <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"><Trash2 className="h-4 w-4" />Delete all data</button>}
      </div>

      {confirming && (
        <div className="mt-4 border-t border-red-100 pt-4">
          <p className="text-sm text-zinc-700">This cannot be undone. Type <strong className="font-semibold text-red-700">{DELETE_ALL_CONFIRMATION}</strong> to confirm.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-label="Deletion confirmation phrase"
              placeholder={DELETE_ALL_CONFIRMATION}
              autoComplete="off"
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-300 focus:border-red-400 focus:ring-4 focus:ring-red-100"
            />
            <div className="flex gap-2">
              <button type="button" onClick={cancel} className="h-10 flex-1 rounded-xl px-4 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 sm:flex-none">Cancel</button>
              <button type="button" disabled={pending || confirmation !== DELETE_ALL_CONFIRMATION} onClick={remove} className="h-10 flex-1 whitespace-nowrap rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 sm:flex-none">{pending ? "Verifying…" : "Verify and delete"}</button>
            </div>
          </div>
          {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
