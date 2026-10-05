"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/dates";

/**
 * One rendered History entry -- the server has already resolved the
 * `title`/`detail` pair (see `describeObjectEvent`) and serialised
 * `occurredAt` to an ISO string, since a `Date` crossing into a Client
 * Component needs to travel as a string the same way every other date prop
 * in this app already does.
 */
export type ObjectHistoryEntry = { id: string; title: string; detail: string | null; occurredAt: string };

/**
 * An Object's own history (KD-048 Phase 1) -- the generalized form of
 * Documents' old, bespoke `ActivityEvent`-backed section, now usable from
 * any Object's own page rather than only a Document's. Newest first,
 * unfiltered (no significance scoring yet -- Phase 4), and collapsed until
 * asked for.
 *
 * `fallbackCreatedAt` reproduces the one thing the old section did that a
 * still-empty `ObjectEvent` stream can't yet: a brand-new record with no
 * Kinesis Link, deletion, or retype against it yet has no events of its own
 * (Phase 1 doesn't wire creation-time emission everywhere), so this shows a
 * single "Created" line from the record's own `createdAt` instead of an
 * empty section.
 */
export function ObjectHistory({ entries, fallbackCreatedAt, locale }: { entries: ObjectHistoryEntry[]; fallbackCreatedAt?: string; locale: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rows = entries.length > 0 ? entries : fallbackCreatedAt ? [{ id: "created", title: "Created", detail: null, occurredAt: fallbackCreatedAt }] : [];
  if (!rows.length) return null;
  const latest = rows[0];

  // Collapsed by default: a record that's been worked on a lot built up a
  // History taller than the rest of its page. The closed card still says
  // how much there is and what happened last; opening it slides the list
  // out in place (a grid-row transition, the same as the Relationships
  // inspector's History) rather than jumping.
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-3 rounded-3xl p-5 text-left sm:p-6"
      >
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            History
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">{rows.length}</span>
          </h2>
          {!open && (
            <p className="mt-1 truncate text-sm text-zinc-500">
              Last: {latest.title} · {formatDate(latest.occurredAt, locale)}
            </p>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <div className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div id={listId} inert={!open} className="overflow-hidden">
          <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
            {rows.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
                <div>
                  <p className="text-sm font-medium text-zinc-700">{entry.title}</p>
                  {entry.detail && <p className="mt-0.5 text-sm text-zinc-500">{entry.detail}</p>}
                  <p className="mt-0.5 text-xs text-zinc-400">{formatDate(entry.occurredAt, locale)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
