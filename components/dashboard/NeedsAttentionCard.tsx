"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, FileText, Flag, ListTodo, Pencil, Target, X } from "lucide-react";
import { CustomModuleIcon } from "@/lib/custom-modules/icons";
import { DismissButton } from "./DismissButton";
import { ICON_ACTION_CLASS } from "./icon-action-styles";
import { toggleMilestoneAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { setTodoStatusAction, updateTodoDueDateAction } from "@/app/(app)/todos/actions";
import type { AttentionItem } from "@/lib/data/attention";
import { formatDate, formatDeadline, formatExpiry } from "@/lib/dates";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import { Modal } from "@/components/overlay/Modal";
import { ResolveActions } from "./ResolveActions";

// Documents' and To-Dos' own module icons; a milestone belongs to a Goal, so
// it borrows Goals' icon rather than To-Dos' -- ListTodo previously did
// double duty for both, which made an overdue milestone indistinguishable
// from an overdue to-do at a glance.
const icons = { document: FileText, milestone: Target, todo: ListTodo };

const attentionBadgeClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700";

/**
 * Every kind shares this list's own warning colour -- amber, the same tone
 * the header and the "Needs attention" badge already use -- so nothing here
 * reads as more or less urgent than anything else on it. Only the icon says
 * which module an item came from; a custom item's icon is its own module's,
 * the same lookup its own module page uses, just recoloured to match.
 */
function AttentionIcon({ item }: { item: AttentionItem }) {
  // A lookup of which icon component to render, not a component created
  // during render -- CustomModuleIcon renders its own inline lookup for the
  // same reason (react-hooks/static-components), so this branches on the
  // JSX rather than assigning either resolver to an `Icon` variable first.
  if (item.kind === "custom") return <span className={attentionBadgeClass}><CustomModuleIcon name={item.icon} className="h-5 w-5" /></span>;
  const Icon = icons[item.kind];
  return <span className={attentionBadgeClass}><Icon className="h-5 w-5" /></span>;
}
export function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  const today = useToday();
  const { locale } = useFormatPreferences();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = items.filter((item) => !dismissed.includes(item.key));
  return <>
    <button type="button" onClick={() => setOpen(true)} className="group rounded-3xl border border-zinc-200/80 bg-white p-5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)]">
      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50"><Flag className="h-[18px] w-[18px] text-zinc-700" /></div><p className="text-sm font-semibold text-zinc-700">Needs attention</p></div>
      <div className="mt-6"><p className="text-[38px] font-semibold leading-none tracking-tight">{visible.length}</p><p className="mt-2 text-sm text-zinc-500">items overdue</p></div>
      <p className="mt-6 text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900">See all →</p>
    </button>
    {open && <Modal labelledBy="attention-title" onClose={() => setOpen(false)} customHeader panelClassName="p-6 sm:max-w-2xl">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><BellRing className="h-5 w-5" /></span><h2 id="attention-title" className="text-2xl font-semibold">Needs attention</h2></div><p className="mt-3 text-sm text-zinc-500">Expired documents, and overdue milestones, to-dos and reminders.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button></div>
        <div className="mt-6 space-y-3">
          {visible.length ? visible.map((item) => {
            const timing = item.kind === "document" ? formatExpiry(item.date, today) : formatDeadline(item.date, today);
            return <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4">
              <Link href={item.href} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                <AttentionIcon item={item} />
                <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900">{item.title}</span><span className="mt-0.5 block text-sm text-zinc-500">{item.context} · {formatDate(item.date, locale)} · {timing}</span></span>
              </Link>
              {item.kind === "milestone"
                ? <ResolveActions
                    dueDate={item.date}
                    onComplete={() => setDismissed((current) => [...current, item.key])}
                    complete={() => toggleMilestoneAction(item.goalId, item.milestoneId, true)}
                    reschedule={updateMilestoneDueDateAction.bind(null, item.goalId, item.milestoneId)}
                  />
                : item.kind === "todo"
                ? <ResolveActions
                    dueDate={item.date}
                    onComplete={() => setDismissed((current) => [...current, item.key])}
                    complete={() => setTodoStatusAction(item.todoId, "DONE")}
                    reschedule={updateTodoDueDateAction.bind(null, item.todoId)}
                  />
                : <div className="flex shrink-0 items-center gap-2">
                    <Link href={item.editHref} onClick={() => setOpen(false)} aria-label="Edit" title="Edit" className={`${ICON_ACTION_CLASS} hover:bg-zinc-50 hover:text-zinc-900`}><Pencil className="h-4 w-4" /></Link>
                    <DismissButton itemKey={item.key} onDismissed={() => setDismissed((current) => [...current, item.key])} />
                  </div>}
            </div>;
          }) : <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center"><p className="font-semibold text-zinc-700">Everything is under control</p><p className="mt-1 text-sm text-zinc-400">There are no items that need attention.</p></div>}
        </div>
    </Modal>}
  </>;
}
