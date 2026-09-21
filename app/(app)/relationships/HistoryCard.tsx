"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { getPersonHistoryAction } from "./actions";
import type { ObjectHistoryEntry } from "@/components/history/ObjectHistory";

/**
 * The collapsed-by-default History card shared by Person details and
 * Relationship details (KD-048) -- replaces the old static "Size and
 * position..." tip on the Person tab, and is new on the Relationship tab,
 * which had no equivalent box before. Collapsed so an inspector already
 * showing several sections doesn't grow further just to hold a rarely-opened
 * list; expanding it "pans out" in place via a CSS grid-row transition
 * rather than pushing content below it around unpredictably.
 */
function HistoryShell({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-[#f7f5f1] px-3.5 py-2.5 text-left hover:bg-zinc-100/70"
      >
        <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
        <span className="flex-1 text-xs font-semibold text-zinc-700">History</span>
        {count > 0 && <span className="rounded-full bg-zinc-200/70 px-1.5 text-[10px] font-semibold text-zinc-500">{count}</span>}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="px-3.5 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ title, detail, time }: { title: string; detail?: string | null; time: string }) {
  return (
    <div className="flex gap-2.5 border-t border-zinc-100 pt-2.5 first:border-t-0 first:pt-0">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-700">{title}</p>
        {detail && <p className="mt-0.5 text-[11px] text-zinc-500">{detail}</p>}
        <p className="mt-0.5 text-[10px] text-zinc-400">{time}</p>
      </div>
    </div>
  );
}

/**
 * `objectId` is null for a person added this session and not yet saved --
 * there is nothing to fetch yet (see `RelationshipPerson`'s own comment), so
 * the card doesn't render at all rather than show an empty shell for a
 * record that doesn't exist server-side.
 */
export function PersonHistoryCard({ objectId, locale }: { objectId: string | null; locale: string }) {
  const [entries, setEntries] = useState<ObjectHistoryEntry[]>([]);

  // No reset-to-[] here: this card only ever lives inside `PersonInspector`,
  // which `PersonInspectorTabs` keys by person id -- switching the selected
  // person remounts this component fresh, so a stale previous person's
  // entries are never around to need clearing.
  useEffect(() => {
    if (!objectId) return;
    let cancelled = false;
    getPersonHistoryAction(objectId).then((rows) => { if (!cancelled) setEntries(rows); });
    return () => { cancelled = true; };
  }, [objectId]);

  if (!objectId) return null;

  return (
    <HistoryShell count={entries.length}>
      {entries.length === 0
        ? <p className="text-[11px] text-zinc-400">Nothing recorded yet.</p>
        : <div className="space-y-2.5">{entries.map((entry) => <HistoryRow key={entry.id} title={entry.title} detail={entry.detail} time={formatDate(entry.occurredAt, locale)} />)}</div>}
    </HistoryShell>
  );
}

/**
 * A connection's own change history doesn't exist yet -- `Relationship` has
 * no `objectId`/`ObjectEvent` coverage at all (KD-048 only wired Person's
 * own add/edit), so there's nothing real to fetch here beyond the row's own
 * `createdAt`. Shown honestly, with a note saying so, rather than inventing
 * entries a save never actually recorded.
 */
export function RelationshipHistoryCard({ createdAt, locale }: { createdAt: string; locale: string }) {
  return (
    <HistoryShell count={1}>
      <HistoryRow title="Connected" time={formatDate(createdAt, locale)} />
      <p className="mt-3 border-t border-zinc-100 pt-2.5 text-[10px] leading-4 text-zinc-400">
        Edits to this connection aren&apos;t tracked yet, so this is all there is to show today.
      </p>
    </HistoryShell>
  );
}
