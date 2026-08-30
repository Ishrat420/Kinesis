"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, FileWarning, Flag, ListTodo, Puzzle, X } from "lucide-react";
import { dismissAttentionItem } from "@/app/actions";
import type { AttentionItem } from "@/lib/data/attention";
import { formatDate, formatDeadline, formatExpiry } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";

const icons = { document: FileWarning, milestone: ListTodo, custom: Puzzle };

export function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  const { locale } = useFormatPreferences();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = items.filter((item) => !dismissed.includes(item.key));
  return <>
    <button type="button" onClick={() => setOpen(true)} className="group rounded-3xl border border-zinc-200/80 bg-white p-5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)]">
      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50"><Flag className="h-[18px] w-[18px] text-zinc-700" /></div><p className="text-sm font-semibold text-zinc-700">Needs attention</p></div>
      <div className="mt-6"><p className="text-[38px] font-semibold leading-none tracking-tight">{visible.length}</p><p className="mt-2 text-sm text-zinc-500">items</p></div>
      <p className="mt-6 text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900">See all →</p>
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="attention-title" className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><BellRing className="h-5 w-5" /></span><h2 id="attention-title" className="text-2xl font-semibold">Needs attention</h2></div><p className="mt-3 text-sm text-zinc-500">Expired documents, overdue milestones, and reminders that are due.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button></div>
        <div className="mt-6 space-y-3">{visible.length ? visible.map((item) => { const Icon = icons[item.kind]; const timing = item.kind === "document" ? formatExpiry(item.date) : item.kind === "milestone" ? formatDeadline(item.date) : "due today"; return <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4"><Link href={item.href} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate font-semibold text-zinc-900">{item.title}</span><span className="mt-0.5 block text-sm text-zinc-500">{item.context} · {formatDate(item.date, locale)} · {timing}</span></span></Link><form action={dismissAttentionItem.bind(null, item.key)} onSubmit={() => setDismissed((current) => [...current, item.key])}><button type="submit" className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900">Cancel</button></form></div>; }) : <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center"><p className="font-semibold text-zinc-700">Everything is under control</p><p className="mt-1 text-sm text-zinc-400">There are no items that need attention.</p></div>}</div>
      </div>
    </div>}
  </>;
}
