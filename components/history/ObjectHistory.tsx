import { formatDate } from "@/lib/dates";

/**
 * One rendered History line -- the server has already resolved
 * `ObjectEvent.description` (see `describeObjectEvent`) and serialised
 * `occurredAt` to an ISO string, since a `Date` crossing into a Client
 * Component needs to travel as a string the same way every other date prop
 * in this app already does.
 */
export type ObjectHistoryEntry = { id: string; description: string; occurredAt: string };

/**
 * An Object's own history (KD-048 Phase 1) -- the generalized form of
 * Documents' old, bespoke `ActivityEvent`-backed section, now usable from
 * any Object's own page rather than only a Document's. Newest first,
 * unfiltered (no significance scoring yet -- Phase 4).
 *
 * `fallbackCreatedAt` reproduces the one thing the old section did that a
 * still-empty `ObjectEvent` stream can't yet: a brand-new record with no
 * Kinesis Link, deletion, or retype against it yet has no events of its own
 * (Phase 1 doesn't wire creation-time emission everywhere), so this shows a
 * single "Created" line from the record's own `createdAt` instead of an
 * empty section.
 */
export function ObjectHistory({ entries, fallbackCreatedAt, locale }: { entries: ObjectHistoryEntry[]; fallbackCreatedAt?: string; locale: string }) {
  const rows = entries.length > 0 ? entries : fallbackCreatedAt ? [{ id: "created", description: "Created", occurredAt: fallbackCreatedAt }] : [];
  if (!rows.length) return null;

  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6">
      <h2 className="text-lg font-semibold">History</h2>
      <div className="mt-4 space-y-4">
        {rows.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
            <div>
              <p className="text-sm font-medium text-zinc-700">{entry.description}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{formatDate(entry.occurredAt, locale)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
