# ADR-013: Kinesis Link Preview Cards Read Live, Batched and Narrow

## Status

Accepted

## Context

KD-042 upgrades Kinesis Links into rich preview cards that show 2–3
configured fields from the linked Object, read live rather than copied onto
the link. "Read live" leaves open how the preview data actually gets
fetched at render time, and two approaches were considered:

1. **Batched, narrow live queries** — at render time, collect every linked
   card's `(objectType, recordId)` on the page, group by Object Type, and
   issue one query per type selecting only the configured preview fields
   (plus name/status for the fallback card).
2. **Materialized preview cache** — a dedicated table holding precomputed
   preview values per record, refreshed on write (event-driven) with a
   periodic reconciliation sweep as a safety net, so reads become a single
   indexed lookup instead of a query against the source record.

Both satisfy KD-042's "live" requirement in practice — materialized would
be *eventually* live (consistent within the write-to-refresh window),
batched-live is live by construction. The deciding factors were Kinesis's
actual deployment shape, not a general best-practices comparison:

* **Kinesis is single-tenant.** The read-amplification scenario a
  materialized cache is built to solve — the same record's preview being
  rendered concurrently across many users/sessions — doesn't really occur
  here. Total concurrency is bounded by however many people use one
  tenant's instance, not by a multi-tenant user base.
* **Kinesis runs on Neon (serverless Postgres).** Neon bills by active
  compute time and auto-suspends idle compute, cold-starting on the next
  request. A materialized cache's reconciliation sweep needs something to
  wake the database on a schedule, which either keeps compute warmer than
  otherwise needed (cost) or eats a cold-start penalty on every sweep run.
  Live queries piggyback on requests that are already waking the database
  for other reasons — no extra scheduled wake-up is introduced.
* **Batching and narrow field selection already remove the main cost.**
  The N+1 query pattern (one query per card) is the actual performance
  risk, and it's fully addressed by grouping lookups per Object Type and
  selecting only the 2–3 preview fields, without needing a second table.
* **It leaves the door open for a permission check with a natural home.**
  Kinesis is single-tenant today, but every table is already scoped by
  `userId` rather than assuming one implicit user — a deliberate hedge for
  a possible future where one database container serves multiple people
  and/or limited collaboration (sharing a page, collaborating on a goal) is
  allowed. No sharing or per-object visibility model exists yet, so there
  is nothing to check today (KD-042's Permissions Assumption section
  covers this). But if that ever ships, a batched *live* read means the
  permission check has an obvious place to slot into — the same fetch
  step, re-run on every render. A materialized cache would have the
  opposite problem: a cached value has no natural re-check point, so it
  could keep showing preview data from before access was revoked until
  the next refresh cycle happened to run.

## Decision

**Preview cards fetch data via batched, narrow live queries against the
source records.** No materialized/cached preview table is built for KD-042.

1. At render time, every linked card on the page/list has its
   `(objectType, recordId)` collected up front.
2. Lookups are grouped by Object Type and issued as one query per type
   (not one query per card), selecting only the fields the target Module's
   preview configuration names.
3. No new table, write-path refresh hook, or reconciliation job is
   introduced by this ticket.

This keeps the implementation simple, avoids a new consistency surface
(cache drift from a missed write-hook, bulk import, or migration bypassing
it), and matches the load profile Kinesis actually has.

## Future consideration

If a materialized preview cache is revisited, it should be because
evidence shows up, not on a schedule or on principle:

* Neon compute-active time climbing measurably, traceable to preview-card
  reads, or
* Card-heavy pages (dashboards, related-record lists) becoming noticeably
  slow in practice.

If that evidence appears, the shape to build is a preview cache row per
record refreshed on write (fast path) plus a periodic reconciliation sweep
that only touches records whose source `updated_at` is newer than the
cache row's `computed_at` (not a full recompute), to bound the cost of the
safety-net pass. Until then, this is explicitly a "revisit if the numbers
say so" item, not a launch requirement.

## Related

* `docs/backlog/KD-042-kinesis-link-rich-preview-card.md` — the feature
  this decision governs the data-fetching approach for, including its
  Permissions Assumption section this ADR's fourth deciding factor
  supports.
* ADR-014 — records why the `userId`-scoped schema this ADR's fourth
  deciding factor leans on is single-tenant policy, not multi-tenant
  infrastructure.
