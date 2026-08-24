"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, Trash2 } from "lucide-react";

export function ActionSubmitButton({ idleLabel, pendingLabel, tone = "primary", iconOnly = false }: { idleLabel: string; pendingLabel: string; tone?: "primary" | "danger"; iconOnly?: boolean }) {
  const { pending } = useFormStatus();
  const toneClass = tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "bg-zinc-950 text-white hover:bg-black";
  if (iconOnly) return <button disabled={pending} type="submit" aria-label={pending ? pendingLabel : idleLabel} title={idleLabel} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="h-5 w-5 animate-spin"/> : <Trash2 className="h-5 w-5"/>}</button>;
  return <button disabled={pending} className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${toneClass}`}>{pending && <LoaderCircle className="h-4 w-4 animate-spin"/>}{pending ? pendingLabel : idleLabel}</button>;
}
