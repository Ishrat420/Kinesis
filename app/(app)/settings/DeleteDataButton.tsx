"use client";

import { useState, useTransition } from "react";
import { useReverification } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { deleteAllDataAction } from "./actions";
import { DELETE_ALL_CONFIRMATION } from "./constants";

export function DeleteDataButton() {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const verifiedDelete = useReverification(deleteAllDataAction);

  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"><Trash2 className="h-4 w-4" />Delete all data</button>;

  return <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-900">Delete everything and return Kinesis to a clean slate?</p><p className="mt-1 text-xs text-red-700">This cannot be undone. To confirm, enter <strong>{DELETE_ALL_CONFIRMATION}</strong>.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Deletion confirmation phrase" autoComplete="off" className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400" />{error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}<div className="mt-3 flex gap-2"><button type="button" disabled={pending || confirmation !== DELETE_ALL_CONFIRMATION} onClick={() => startTransition(async () => { setError(undefined); const result = await verifiedDelete(confirmation); if ("error" in result) { setError(result.error); return; } router.push("/"); router.refresh(); })} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending ? "Verifying…" : "Verify and delete"}</button><button type="button" onClick={() => setConfirming(false)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800"><X className="h-4 w-4" />Cancel</button></div></div>;
}
