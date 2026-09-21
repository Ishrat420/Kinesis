# KD-052 — Event Significance, Surfacing & Change Awareness

**Status:** Planning Needed
**Priority:** Low
**Tags:** Architecture, UX / UI, Needs Research

## Summary

KD-048 (Object Event Model) shipped Phases 1-3 in full: every core module
and Custom Items write a complete, typed `ObjectEvent` stream, read
unfiltered and unscored everywhere it's shown today (a History section,
the dashboard's Recent Activity feed). KD-048's own Phases 4 and 6 were
never started — this ticket splits them out for their own design pass
rather than treating them as a quick follow-on to a now-finished ticket:

* **Phase 4 — Significance & surfacing.** A pure classifier deciding
  which events are worth surfacing *beyond* a plain chronological list,
  and feeding that into at least one real consumer (Kinesis Link preview
  cards).
* **Phase 6 — Change Awareness & AI summaries.** A layer beyond a raw
  diff: knowing whether a change is a *regression* for that specific
  field (an expiry moving earlier is bad; a savings target moving
  earlier is good), plus AI-narrated summaries over the same stream.

**Phase 5 (Timeline / Year in Review) is deliberately not part of this
ticket** — it already has its own ticket, **KD-015 ("Kinesis Year in
Review / Timeline Highlights")**, which already names KD-048 as its
dependency. KD-015 is a *consumer* of whatever this ticket builds
(it curates by significance and date range), not a phase to redo here.
See "Related" below for what should happen to KD-015 now.

## What already exists (confirmed by reading the code, not assumed)

* `ObjectEvent` is complete and unfiltered across every core module and
  Custom Items — Phases 1-3 of KD-048 are genuinely done, not partially.
* **No significance concept exists anywhere today** — no stored score,
  no classifier function, nothing. Every current reader
  (`getObjectEvents`, `getRecentActivity`) shows every event, newest
  first.
* **KD-042's Kinesis Link preview cards (Done) already have the exact
  slot Phase 4 needs.** `lib/data/kinesis-links.ts`'s
  `getKinesisLinkPreviews` builds a `KinesisLinkPreviewStat[]` per
  linked object, one function per object type
  (`getDocumentPreviews`, `getGoalPreviews`, etc.), merged and handed to
  `KinesisLinkCard.tsx`, which renders whatever's in that array with no
  per-type logic of its own. A "Latest: …" stat is one more push onto
  that same array once a qualifying event exists — no change needed to
  the card component itself.
* **No "last viewed" concept exists anywhere** — no column, no table,
  nothing tracks when an account last opened a given record. This
  blocks the one Attention-facing idea KD-048 raised ("this changed
  since you last looked").

## Phase 4 — Significance & surfacing

Carried over from KD-048's own design, unchanged unless replanning
decides otherwise:

**The classifier.** `classifyEventSignificance(event): "low" | "normal"
| "high"` — a small, pure, read-time function, **not a stored column**,
driven by `eventType` + `fieldKey` (or, for `RELATIONSHIP_*` events,
`newRelationshipType`/`oldRelationshipType` — e.g. the bare `RELATES_TO`
a to-do's own incidental linking uses should stay "low", while a
deliberately-chosen type like `BLOCKS` should not). This mirrors
`isGoalOverdue` — a pure function over stored facts rather than a
persisted flag (ADR-010's own precedent) — so the policy stays
centralized and changeable without a migration.

Starting point proposed in KD-048: `GOAL_COMPLETED` /
`ITEM_ARCHIVED` / `STATUS_CHANGED` = high; a `FIELD_CHANGED` on a
notes/description-shaped field = low. Percentage-based thresholds for
numeric fields (a balance moving >10%) were flagged as a reasonable
later refinement, not a v1 requirement.

**Surfacing, first consumer.** Feed "high" events into Kinesis Link
preview cards (KD-042) via the integration point described above.

**Surfacing, second (harder) consumer — Attention.** "This changed
since you last looked" is a plausible future Attention reason, but it
needs a "last viewed" concept that doesn't exist anywhere in Kinesis
today. This is real, separate design work — a new per-user-per-object
timestamp (a new table? a column somewhere existing?), a decision about
which views actually write it (every detail-page view? something
narrower, for cost reasons?), and how it interacts with Attention's
existing overdue/due-soon model, which is otherwise unrelated to this.
**Likely deserves its own sub-ticket rather than being solved inside
this one** — flagged here as an open question, not a commitment.

## Phase 6 — Change Awareness & AI summaries (unscheduled)

Two related but distinct capabilities, both unscheduled and unscoped
beyond KD-048's original one-paragraph mention:

* **Per-domain regression detection** — e.g. "insurance expires earlier
  than before," a metric trending the wrong way. This is a step beyond
  a raw diff or even significance scoring: it requires knowing, *per
  field*, whether the new value is worse or better for that specific
  fact — a date moving earlier is a regression for an expiry, an
  improvement for a savings target. That polarity knowledge is
  domain-specific and would need its own classifier layered on top of
  the event stream (and on top of, or alongside, `classifyEventSignificance`
  — their relationship needs deciding, see Open Questions), not
  something the event itself can encode generically.
* **AI-narrated summaries** — consumes the same read API the Timeline
  (KD-015) would use; needs nothing event-model-specific beyond the
  stream being complete and well-labelled, which it already is. Model
  choice, cost, prompt design, and UX (where does a summary appear, how
  often is it regenerated) are all unexplored.

## Open questions

* **Where does "last viewed" tracking actually belong?** New table
  keyed by `(userId, objectId)`, or something narrower? Which views
  write it, and at what cost (a write on every detail-page load, across
  every module, is a real amount of new traffic)? Worth a design pass
  on its own before Attention's "changed" reason can move from "plausible
  future idea" to planned work.
* **Are significance thresholds fixed in code, or ever user-configurable?**
  KD-048's proposal is a fixed, centralized function. Worth confirming
  that's still the right call before implementation, rather than
  assuming no one will ever want to tune what counts as "high" for
  their own account.
* **How does Phase 6's per-domain regression classifier relate to
  Phase 4's `classifyEventSignificance`?** Same function extended with
  polarity, two independent classifiers consulted together, or a
  Phase 6 concept that doesn't need Phase 4 to exist first at all? Not
  decided in KD-048's original text — needs deciding here.
* **AI summaries: scope this small, or wait for a concrete driver?**
  KD-015 (Timeline) is the nearer, better-specified consumer; AI
  summaries could reasonably wait until Timeline exists and its own
  curated output proves out, rather than being built speculatively
  ahead of a real UI that needs it.

## Related

* **Builds on:** KD-048 (Object Event Model) — Phases 1-3, Done. This
  ticket is exactly the Phase 4/6 work KD-048's own doc deferred rather
  than treating as in-scope follow-on.
* **Feeds:** KD-015 (Kinesis Year in Review / Timeline Highlights) —
  currently `Idea` / tagged `Maturity Dependent`, `Foundation Dependent`,
  blocked on KD-048 existing. Since KD-048 Phases 1-3 are now Done, KD-015
  is unblocked for its *foundation* (real event data exists to build a
  Timeline over) but still benefits from this ticket's significance
  work for genuine curation ("meaningful highlights over raw counts," per
  KD-015's own notes) rather than a Timeline that has to show everything
  because nothing is scored yet. Worth revisiting KD-015's own tags now
  rather than waiting for this ticket to fully close.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card, Done) — the
  existing integration point Phase 4's "Latest: …" line would extend.
* **Precedent:** ADR-010 — `isGoalOverdue`'s pure-function-over-stored-facts
  pattern, which `classifyEventSignificance` is designed to follow.
