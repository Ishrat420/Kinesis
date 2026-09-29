# ADR-016: Event Significance, Surface Score, and Change Awareness (KD-052)

## Status

Accepted — for Phase 4 (implemented). Phase 5 is recorded here as a
design snapshot, not a shipped decision — KD-052 itself moved back to
Planning Needed for Phase 5 specifically; see that ticket's own Status.

## Context

KD-048 (Object Event Model) shipped a complete, typed `ObjectEvent`
stream across every module, read unfiltered and unscored everywhere it
was shown — a History section, the dashboard's Recent Activity feed,
and the Kinesis Link card's own "sneak peek." KD-048 named two further
phases (significance/surfacing, and change awareness/regression
detection) in a single paragraph each and left them there. KD-052
picked up that unfinished work, re-planned it as this ticket's own
Phase 4 and Phase 5, and made a long series of concrete design and
implementation decisions getting Phase 4 to a shipped state. Those
decisions are scattered across many rounds of ticket edits and code
changes; this ADR consolidates the ones worth keeping findable in one
place, the same role ADR-010 and ADR-013 play for their own tickets.

## Decision — Phase 4 (Significance & Surfacing), implemented

**Two small, pure, orthogonal functions, not one.** `classifyEventSignificance(event)`
answers "how meaningful is this event, on its own" (`"high" | "normal" | "low" | "ignore"`).
`calculateEventSurfaceScore(event, now, linkType)` answers "how
strongly should this event compete for a particular surface right
now," composing significance with freshness, Kinesis Link relevance,
and magnitude. Neither is folded into the other — a consumer that only
wants significance (a future Timeline, a notification) shouldn't have
to supply a `now` and a `linkType` it doesn't have.

**File placement mirrors an existing precedent, split across two
files.** `classifyEventSignificance` and its one required helper,
`calculatePercentChange`, live in `lib/data/object-events.ts`,
alongside `describeObjectEvent` — the same way `numericDirection`/
`relationshipIconKey` already live next to the rendering logic they
support, rather than in a separate module. The four Surface Score
pieces (`calculateFreshnessScore`, `calculateKinesisLinkRelevance`,
`calculateChangeMagnitude`, `calculateEventSurfaceScore`) live in a new
`lib/data/surface-score.ts`, which imports from `object-events.ts` —
kept separate so an already-large file didn't grow further, with the
dependency running one way only (no circular import between the two).

**`classifyEventSignificance` needed module-awareness for exactly two
fieldKeys, despite the ticket's own "driven by eventType + fieldKey
alone" framing.** Two literal `fieldKey`s are written by more than one
module with genuinely different intended tiers:

* `dueDate` — HIGH for Todo, NORMAL (interim) for a Custom Item. This
  is a real, intended difference (KD-052 asked for it), so the
  classifier's input type gained an `objectType` field specifically to
  resolve it.
* `name` — every module that writes it (Document, Finance, Todo,
  Custom Item) already means LOW by it. KD-052's own draft had stated
  Person's `name` as NORMAL, but since the classifier has no way to
  treat one module's `name` differently from every other module's
  identical key without also branching every other shared key by
  module, `name` was aligned to the universal LOW convention instead,
  overriding that one interim line in the ticket rather than adding
  new plumbing to preserve it. Person's own `icon`/`color` were
  unaffected (no other module writes those keys) and kept their stated
  NORMAL default.

**The magnitude dead zone lives at the classification boundary, not in
the score.** Finance's `amount` field is the one row in the whole
significance table whose base tier depends on the value, not just the
field — under ~2% change, it downgrades from HIGH to NORMAL before any
scoring happens. Both `classifyEventSignificance` (for the gate) and
`calculateChangeMagnitude` (for its own `+0`–`+15` score bonus) call
the one shared `calculatePercentChange` helper, so the two can't drift
out of sync by each computing the percentage independently. `oldValue`
of `0`/`null` is treated as automatically maximal magnitude (going
from nothing to a real value is never a dead-zone tick), except `0 ->
0`, which has nothing to score in the first place.

**`getKinesisLinkRecentEvents` needed a real query-shape change, not
just scoring code in front of it.** The pre-KD-052 version used
Prisma's `distinct: ["objectId"]` + `orderBy: occurredAt desc`, which
picks a single row per linked object by recency alone, entirely in
SQL, before any JavaScript classification could run — there was no
candidate set left to rank. This was discovered by reading the actual
code, not assumed from the ticket's own (incorrect) claim that scoring
could sit "in front of" the existing query unchanged. The query now
fetches every event per linked object within a 90-day window (capped
per object at 50 rows, so one unusually chatty object can't blow up
the query), groups by `objectId` in application code, and scores/
selects the winner there — still one query, still no schema change,
but genuinely different data flowing through it.

**IGNORE changes one existing surface's behavior; Recent Activity is
deliberately exempt.** `getObjectEvents` (an object's own History)
now excludes IGNORE-tier events (a Document's Reminder lead time,
Issue date, and raw Link) — the one place this ticket changes
pre-existing behavior rather than only adding a new consumer.
`getRecentActivity` (the dashboard's Recent Activity feed) stays fully
unfiltered on purpose: its whole job is recording every recent change
in order, and it was explicitly decided **not** to be a Surface Score
consumer at all, unlike the Kinesis Link peek.

**Interim defaults for gaps found only while writing the classifier,
not pre-decided in the ticket:**

* `ITEM_DELETED` has no row in any KD-052 table — defaults to NORMAL,
  the same fallback the ticket already uses for "a field I don't
  recognize" elsewhere.
* Goal's `unit` field isn't named in the "Measurable target updated"
  row (only "target value or current value" is) — folded into the same
  HIGH tier by association, as a third attribute of the same
  measurable target.
* `RELATIONSHIP_CHANGED` (a retype) is unconditionally HIGH as an
  interim rule, regardless of the old/new type involved — a
  conservative "don't lose it" default pending real design work on
  what a retype's significance should actually depend on.

**`GOAL_REOPENED` was added as its own event type**, mirroring
`GOAL_COMPLETED`'s existing carve-out from generic `STATUS_CHANGED` —
`updateGoalStatusAction` now writes it whenever the new status is
Active and the goal wasn't already Active. Not a significance change
(Reopened was already unconditionally HIGH either way), but a nicer,
dedicated History/peek line ("Goal reopened") instead of a generic
"Status changed," and cleaner event semantics for anything reading the
stream later. This needed a schema migration
(`20261018000000_goal_reopened_event`) and a write-path change,
decided separately from — but alongside — the classifier work.

**Explicitly deferred, not designed here:** Person/Relationships'
own full significance table (its named fields fall back to the NORMAL
ad-hoc default in the meantime); user-configurable priority for custom
fields and custom-typed Kinesis Links; "last viewed" tracking (blocks
Attention using this work at all, but Attention was never a Surface
Score consumer to begin with); `RELATIONSHIP_CHANGED`'s real design,
beyond its interim HIGH default above.

## Decision — Phase 5 (Change Awareness), design snapshot only

Phase 5 (`classifyChangePolarity(event): "improvement" | "regression" | "neutral"`)
was designed to the same rigor as Phase 4 — a full per-module table,
mirroring Phase 4's own structure — and several of its open questions
were resolved during that design pass:

* **Finance's `amount`/`rate` polarity does not depend on `kind`**
  (asset/liability/income/expense) at all. An increase is always
  Improvement, a decrease always Regression, uniformly — mirroring how
  Phase 4's own magnitude math already treats every `kind` identically.
  This also means polarity classification needs no new data at
  classification time (no live join to `FinanceItem.kind`, no
  snapshot on the event row) — a question the first design draft
  raised that turned out not to exist once this was decided.
* **Goal's `currentValue`/`targetValue` change is NEUTRAL.** Nothing
  in the `Goal` schema records whether progress means the number going
  up or down (a "save up to $30k" goal and a "pay down $30k debt" goal
  are schema-identical) — decided to stay NEUTRAL rather than invent a
  goal-direction concept that doesn't exist.
* **Goal's `targetDate` moving earlier/later is NEUTRAL.** An earlier
  draft of this ticket's own illustrative prose called an earlier
  target date "good," but that was example text, not a considered
  decision — "less time to reach a target" reads at least as
  plausibly as a regression. Decided to leave it NEUTRAL rather than
  inherit that framing uncritically.
* **Todo's Status changed (To Do <-> Waiting) is NEUTRAL.** The
  status's own existing grey/yellow/green color already carries this
  signal from the Kinesis Link UI — a separate polarity judgment on
  top of it would be redundant, not additive.

**Genuinely still open:** whether Goal's Reopened deserves a different
polarity when the prior status was specifically Finished (un-completing
a done goal) versus Archived/Revisit Later (ordinary re-engagement).
`GOAL_REOPENED` doesn't currently record which status it came from —
`updateGoalStatusAction` calls `recordEvent` with no `oldValue`, unlike
generic `STATUS_CHANGED` — so answering this would need a write-path
change before it's even decidable, not just a classifier rule.

**No destination was decided.** A `polarity` field alongside
`ObjectEventDescription.change`'s existing `direction`, consumed by
History and the Kinesis Link peek to tint or icon a change
semantically, was floated as the natural next step but explicitly
left as "proposed, not decided" — no color scheme, icon set, or
confirmed set of consuming surfaces exists.

**Phase 5 is not implemented.** KD-052 was moved back to Planning
Needed for Phase 5 specifically (Phase 4 ships as-is) — the design
above is a snapshot of where the thinking stood when paused, not a
green light to build against. Revisit KD-052's own Phase 5 section and
Open Questions before resuming.

## Related

* `docs/backlog/KD-052-event-significance-and-change-awareness.md` —
  the ticket this ADR summarizes; the full detail (every table row, every
  worked example) lives there, not duplicated here.
* `docs/backlog/KD-048-object-event-model-DONE.md` — the event stream
  Phase 4 and Phase 5 both classify.
* ADR-010 — `isGoalOverdue`'s pure-function-over-stored-facts pattern,
  which `classifyEventSignificance` and `classifyChangePolarity` both
  follow: read-time, deterministic, no stored score/column.
* ADR-013 — the same "batched, narrow, live" reasoning this ADR's
  `getKinesisLinkRecentEvents` fix continues: no new table, no cache,
  just a corrected query shape and application-side scoring.
