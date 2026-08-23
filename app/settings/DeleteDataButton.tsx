"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { deleteAllDataAction } from "./actions";

export function DeleteDataButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"><Trash2 className="h-4 w-4" />Delete all data</button>;

  return <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-900">Delete everything and return Kinesis to a clean slate?</p><p className="mt-1 text-xs text-red-700">This cannot be undone. Export your data first if you want a copy.</p><div className="mt-3 flex gap-2"><button type="button" disabled={pending} onClick={() => startTransition(async () => { await deleteAllDataAction(); router.push("/"); })} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending ? "Deleting…" : "Yes, delete everything"}</button><button type="button" onClick={() => setConfirming(false)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800"><X className="h-4 w-4" />Cancel</button></div></div>;
}
