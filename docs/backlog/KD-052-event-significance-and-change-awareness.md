# KD-052 — Event Significance, Surfacing & Change Awareness

**Status:** Accepted
**Priority:** Low
**Tags:** Architecture, UX / UI, Data Model

## Summary

KD-048 (Object Event Model) shipped Phases 1-3 in full: every core module
and Custom Items write a complete, typed `ObjectEvent` stream, read
unfiltered and unscored everywhere it's shown today (a History section,
the dashboard's Recent Activity feed, and now the Kinesis Link card's own
History peek). KD-048's own Phases 4 and 6 were never started — this
ticket splits them out for their own design pass rather than treating
them as a quick follow-on to a now-finished ticket:

* **Phase 4 — Significance & surfacing.** A pure classifier deciding
  which events are worth surfacing *beyond* a plain chronological list,
  feeding a deterministic scoring pass that decides what a given UI
  surface shows. **This phase is now fully specified below** — a
  concrete per-event significance table across every module, plus a v1
  "Surface Score" algorithm and the destination thresholds that consume
  it. Not yet implemented.
* **Phase 6 — Change Awareness & AI summaries.** A layer beyond a raw
  diff: knowing whether a change is a *regression* for that specific
  field (an expiry moving earlier is bad; a savings target moving
  earlier is good), plus AI-narrated summaries over the same stream.
  Still unscheduled and unscoped beyond the one paragraph below —
  this ticket update does not touch Phase 6.

**Phase 5 (Timeline / Year in Review) is deliberately not part of this
ticket** — it already has its own ticket, **KD-015 ("Kinesis Year in
Review / Timeline Highlights")**, which already names KD-048 as its
dependency. Timeline is a fundamentally different kind of surface from
everything else this ticket scores: it's about showing progression over
time — closer to a series of snapshots building up naturally as time
passes than a ranked pick of a standout moment at read time — so it is
**not** a Surface Score consumer the way the Kinesis Link peek or
Dashboard are (see "Destination thresholds" below). It's its own,
separately-scoped, **low-priority** design pass under KD-015, not a
phase to redo here. See "Related" below for what should happen to
KD-015 now.

## What already exists (confirmed by reading the code, not assumed)

* `ObjectEvent` is complete and unfiltered across every core module and
  Custom Items — Phases 1-3 of KD-048 are genuinely done, not partially.
* **No significance concept exists anywhere today** — no stored score,
  no classifier function, nothing. Every current reader
  (`getObjectEvents`, `getRecentActivity`, `getKinesisLinkRecentEvents`)
  shows every event, newest first, with no scoring or filtering.
* **KD-042's Kinesis Link preview cards (Done) already have the exact
  slot Phase 4 needs**, and the History peek built since (the "big
  diff" / per-type relationship icon work) already renders a single
  qualifying event nicely once one is chosen — Phase 4's job is
  *picking which one*, not building anywhere new to show it.
  `lib/data/kinesis-links.ts`'s `getKinesisLinkRecentEvents` already
  does the batched, single-most-recent-event lookup per linked object;
  the Surface Score pass below is a filter/ranking step in front of
  that query, not a new query shape.
* **`describeObjectEvent` (`lib/data/object-events.ts`) is the one
  place that already knows every event type's shape** — it's the
  natural home for a co-located significance table, the same way
  `numericDirection`/`relationshipIconKey` already live next to the
  rendering logic they support.
* Two concrete HIGH-significance events named in this ticket's table
  already exist in code, built ad hoc before this ticket was written up:
  `DOCUMENT_EXPIRING_SOON` (a document entering its reminder window) and
  `GOAL_MILESTONE_COMPLETED` (carrying a `"<completed>/<total>"`
  progress snapshot). Both are usable inputs to the classifier below
  with no further schema work.
* **No "last viewed" concept exists anywhere** — no column, no table,
  nothing tracks when an account last opened a given record. This
  blocks the one Attention-facing idea KD-048 raised ("this changed
  since you last looked"), and is explicitly out of scope for the
  Surface Score below (see "Attention" in the destination thresholds).

## Phase 4 — Significance & surfacing (v1 design accepted)

### Design principle

Deterministic and boring internally, even where the result should feel
smart. Every score is reconstructable by hand from the event's own
stored fields plus the rules below — no learned weights, no hidden
state. When Kinesis surfaces something that looks wrong, the fix is
reading this table, not debugging a black box.

### 1. Base significance

`classifyEventSignificance(event): "high" | "normal" | "low" | "ignore"`
— a small, pure, read-time function, **not a stored column**, mirroring
`isGoalOverdue`'s pure-function-over-stored-facts pattern (ADR-010).
Driven by `eventType` + `fieldKey` (for `FIELD_CHANGED`/named-column
diffs) or by relationship type (for `RELATIONSHIP_*` events).

```text
HIGH    = 70
NORMAL  = 40
LOW     = 10
IGNORE  = 0, excluded before any scoring happens
```

`IGNORE` stops immediately and is never considered for any awareness
surface, including plain History — see "Reminder" and "Issue date"
below for cases that should not even appear as a line item.

#### Finance — Asset / Liability

| Change | Significance |
|---|---|
| Notes | LOW |
| Name | LOW |
| Balance increase or decrease | HIGH¹ |
| Interest rate increase or decrease | HIGH |
| Monthly payment increase or decrease | HIGH |

#### Finance — Income / Expense

| Change | Significance |
|---|---|
| Notes | LOW |
| Name | LOW |
| Start date / End date | NORMAL |
| Frequency | HIGH |
| Amount increase or decrease | HIGH¹ |

¹ **Magnitude dead zone, not unconditional HIGH.** Balance/Amount
changes under ~2% downgrade to NORMAL regardless of this table — see
"Magnitude" below. This is the one row in this whole classification
where the base tier itself depends on the value, not just the field;
every other HIGH in these two tables (interest rate, monthly payment,
frequency) stays unconditional, since none of them drift on their own.

#### Document

| Change | Significance |
|---|---|
| Notes | LOW |
| Name | LOW |
| Type | N/A — not editable once created, so never diffed |
| Reminder (lead time / `prompt`) | IGNORE |
| Expiry date | HIGH |
| Issue date | IGNORE |
| Document number | NORMAL |
| Country | NORMAL |
| Link | IGNORE |
| Kinesis Links (typed) | HIGH |
| Custom Kinesis Links | HIGH |
| **Document entering its reminder window** (automatic, system-detected — already implemented as `DOCUMENT_EXPIRING_SOON`) | **HIGH** |

#### Goal

| Change | Significance |
|---|---|
| Status changed | HIGH |
| Completed | HIGH |
| Reopened | HIGH |
| Target date changed | HIGH |
| Milestone added | NORMAL |
| Milestone updated | LOW |
| Milestone completed | HIGH |
| Milestone deleted | NORMAL |
| Measurable target added | HIGH |
| Measurable target updated (target value or current value) | HIGH |

Implementation note: "Milestone added/updated/completed/deleted" map
directly onto the `GOAL_MILESTONE_ADDED`/`UPDATED`/`COMPLETED`/`DELETED`
event types. "Goal reopened" does **not** currently have a dedicated
event type the way "Goal completed" does (`GOAL_COMPLETED`) — moving a
goal *out* of "Finished" back to another status is today just a generic
`STATUS_CHANGED` row. The classifier can special-case this (`STATUS_CHANGED`
where `oldValue === "Finished"` scores HIGH like a reopen; every other
`STATUS_CHANGED` transition falls through to a lower default) without a
new event type or migration — flagged here so it isn't missed during
implementation, not proposing a schema change.

#### Kinesis Link relationship type

The significance of the relationship-change event itself
(`RELATIONSHIP_ADDED`/`REMOVED`/`CHANGED` for a link of this type):

| Type | Significance |
|---|---|
| Supports | NORMAL |
| Supported by | NORMAL |
| Blocks | HIGH |
| Blocked by | HIGH |
| Depends on | HIGH |
| Required for | HIGH |
| Related to | LOW |
| Alongside | NORMAL |
| Any other custom Kinesis Link | LOW |

This table classifies *the link-change event*, not the downstream
object's own changes — see "Kinesis Link relevance" in the scoring
formula below for that, a related but separate idea: it means a
meaningful change to an object is more relevant to surface when
*another* object actually depends on it, not that `DEPENDS_ON` itself
is more important everywhere it appears.

### 2. Surface Score

Applies only to events that pass the significance gate below — **LOW
can never escape History purely because of context or freshness**, and
IGNORE never reaches scoring at all:

```ts
if (significance === "ignore") exclude;      // never shown anywhere
if (significance === "low") historyOnly;      // valid History line, never scored further
// only "normal" / "high" continue to scoring
```

```text
Surface Score
= Base significance
+ Freshness
+ Kinesis Link relevance
+ Magnitude
```

Not every event needs all four components — Freshness and Kinesis Link
relevance apply wherever the event has an age and is being viewed
through a link; Magnitude only applies where Kinesis understands the
value numerically (see below).

**Freshness** (for Kinesis Link card peeks and anywhere else age
matters):

```text
0-3 days      +30
4-7 days      +20
8-30 days     +10
31-60 days     +0
61-90 days    -30
>90 days      exclude
```

This stops a six-month-old HIGH event permanently beating something
useful that happened yesterday.

**Kinesis Link relevance** (when deciding what to show *through* a
Kinesis Link, i.e. is this object depended on by the one whose card is
rendering):

```text
Blocks / Blocked by         +20
Depends on / Required for   +20
Supports / Supported by     +10
Alongside                    +5
Related to                   +0
Custom                       +0
```

**Magnitude** (Finance only for v1 — never applied to names, notes, or
other arbitrary text):

```text
< 2% change      +0
2-10%            +5
10-25%          +10
>25%            +15
```

Tunable later; not a v1 blocker.

**Magnitude dead zone (base-tier downgrade, not just a score bonus).**
Finance's `amount`/balance field is written by more than manual edits —
Kinesis already applies automatic interest/contribution arithmetic to
Finance items, recording an `ObjectEvent` for that just like a manual
change (shipped ahead of this ticket). A daily accrual might move a
balance by a few cents: an unconditional "Balance/Amount change = HIGH"
means that tick scores HIGH(70) + same-day freshness(+30) = 100 on its
own, clearing every destination threshold including Dashboard (>=80) —
flooding "meaningful changes" with routine accrual noise on every
account, every day.

So for the two rows marked ¹ above specifically, magnitude **gates the
base tier**, evaluated before the rest of Surface Score:

```text
< 2% change   -> base significance downgrades from HIGH to NORMAL
>= 2% change  -> base significance stays HIGH, as the table says
```

The magnitude *score* (`+0` to `+15` above) still applies afterward as
usual on top of whichever tier that lands on. Nothing else in the
significance tables works this way — this dead zone exists specifically
because Balance/Amount is the one field in this whole classification
with a system-driven writer capable of making many small, real,
individually-uninteresting changes; every other HIGH row (interest
rate, monthly payment, frequency, expiry date, milestone completed,
etc.) is written by a deliberate action or a real boundary crossing,
never automatic drift, so none of them need one.

### 3. Selection algorithm

```text
1. Get recent ObjectEvents.
2. Classify:
     IGNORE      -> discard
     LOW         -> History only
     NORMAL/HIGH -> continue
3. Calculate Surface Score:
     base significance + freshness + Kinesis Link relevance + magnitude (where supported)
4. Apply the destination's threshold.
5. Pick the highest-scoring event.
6. If tied, pick the newest.
7. If nothing qualifies, show nothing.
```

### 4. Destination thresholds

| Surface | Threshold |
|---|---|
| History | none — HIGH, NORMAL and LOW all appear, unscored |
| Kinesis Link animated peek | score >= 50 |
| Dashboard "meaningful changes" | score >= 80 |
| Timeline (KD-015) | **not** this table — a different mechanism entirely, see below |
| Attention | **not** this threshold — separate algorithm, TBD (see Open Questions) |

**Timeline does not belong in this comparison at all**, and an earlier
draft of this ticket wrongly gave it a threshold (score >= 65) as if it
were just another consumer picking the single best recent event the
way the peek and Dashboard do. It isn't. Timeline is about *progression
over time* — closer to a series of snapshots building up naturally as
time passes than a ranked pick of standout moments at read time.
Surface Score answers "what's the one best thing to show right now";
Timeline needs to answer "what does the shape of this record's history
look like," which is a different question with a different mechanism
(what gets captured as a snapshot, how often, what makes a span of time
worth a point on the timeline). That's separate design work under
KD-015, **not scoped here, and low priority** — see Open Questions.

### 5. Kinesis Link animated peek — concrete rule

```text
Eligibility: NORMAL or HIGH, age <= 90 days, Surface Score >= 50
Selection:   highest Surface Score, then newest event
```

One additional safeguard: **only one event per card.** Don't rotate
through five events — the card briefly reveals the single best current
change, then returns to the live preview, exactly as the existing peek
animation already works (`KinesisLinkCard.tsx`'s `useHistorySneakPeek`);
this ticket changes *which* event is picked, not the animation itself.

### Worked examples

**Savings balance change, today, on a depended-upon object:**

```text
Balance $10,000 -> $20,000

HIGH                     70
Occurred today          +30
Depends on               +20
100% increase            +15
----------------------------
Surface Score           135
```

Definitely show it. The peek reads "Savings increased from $10,000 to
$20,000."

**Name change, today, on the same depended-upon object:**

```text
"House savings" -> "House deposit"

LOW                       10
```

LOW is gated before scoring — this never reaches the peek regardless of
freshness or relevance, and never even computes a number. (An earlier
draft of this scoring idea let LOW events reach 60 through context and
freshness alone; the significance gate above exists specifically to
close that hole.)

**Document expiry changed, yesterday, on a Required-for'd document:**

```text
HIGH                      70
Changed yesterday        +30
Required for              +20
----------------------------
Total                    120
```

Very strong candidate.

**Document number changed, 25 days ago, Related to:**

```text
NORMAL                    40
25 days ago               +10
Related to                 +0
----------------------------
Total                     50
```

Barely eligible for a card peek (score exactly at the >= 50 threshold),
nowhere near Dashboard-worthy (>= 80).

**Daily interest accrual, today, on a depended-upon savings account:**

```text
Balance $10,000.00 -> $10,004.32 (0.04% change)

Balance change, but < 2%     -> downgraded to NORMAL     40
Occurred today                                          +30
Depends on                                               +20
Magnitude (< 2%)                                          +0
----------------------------------------------------------------
Surface Score                                             90
```

Without the dead zone this would have started from HIGH(70) and scored
120. With it, 90 still clears both the peek (>=50) and Dashboard (>=80)
thresholds here — but only because it's fresh *and* depended-upon.
Strip either of those away (the same accrual on an account nothing
depends on) and it drops to 40+30+0+0 = 70: clears the peek, misses
Dashboard. That's the dead zone doing its job — the automatic tick no
longer qualifies as "meaningful" on its own tier alone; something else
(a real dependency, good timing) has to carry it the rest of the way.
A genuinely large same-day swing on the same account still starts from
HIGH and clears every threshold easily, as the first example above
shows.

## Phase 6 — Change Awareness & AI summaries (unscheduled)

Two related but distinct capabilities, both unscheduled and unscoped
beyond KD-048's original one-paragraph mention. Unaffected by this
update — Surface Score is a *volume/relevance* ranking, not a
*good/bad* judgment, and the two are designed to stay independent (see
Open Questions):

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
  every module, is a real amount of new traffic)? Still blocks Attention
  using this scoring work at all — Attention deliberately does **not**
  consume the Surface Score thresholds above and needs its own
  algorithm once this exists.
* **How does Phase 6's per-domain regression classifier relate to
  Phase 4's `classifyEventSignificance`?** Same function extended with
  polarity, two independent classifiers consulted together, or a
  Phase 6 concept that doesn't need Phase 4 to exist first at all? Not
  decided in KD-048's original text — needs deciding here.
* **What is Timeline's own selection mechanism?** Now explicitly *not*
  a Surface Score consumer (see "Destination thresholds" above) — it's
  a progression/snapshot view, closer to "capture a point periodically
  and let the shape build up over time" than "rank recent events and
  pick a winner." What gets snapshotted, how often, and whether it
  reuses Phase 4's significance classification at all is undesigned.
  Belongs entirely to KD-015, **out of scope here, and low priority** —
  not a blocker for anything in this ticket.
* **AI summaries: scope this small, or wait for a concrete driver?**
  KD-015 (Timeline) was originally assumed to be the nearer,
  better-specified consumer to wait for, but it's now understood to be
  its own low-priority design pass with an undecided mechanism (see
  above) — so "wait for Timeline" is no longer obviously the shorter
  wait. AI summaries could still reasonably wait for *some* concrete
  consumer to prove curation out against, just not necessarily Timeline
  specifically anymore.
* **Should "Goal reopened" get its own event type** (`GOAL_REOPENED`,
  mirroring `GOAL_COMPLETED`), **or stay a classifier-side special case**
  on `STATUS_CHANGED`'s `oldValue`? Either works for scoring; a
  dedicated type would also let History/the Kinesis Link peek render it
  with its own copy instead of a generic "Status changed" line, the way
  `GOAL_COMPLETED` already does for the opposite transition — worth
  deciding at implementation time rather than here.
* **Magnitude thresholds and the freshness/relevance point values are
  the stated v1 defaults, explicitly called out as tunable later** — no
  further decision needed before implementation, just noting they are
  not meant to be treated as final forever.

## Related

* **Builds on:** KD-048 (Object Event Model) — Phases 1-3, Done. This
  ticket is exactly the Phase 4/6 work KD-048's own doc deferred rather
  than treating as in-scope follow-on.
* **Feeds:** KD-015 (Kinesis Year in Review / Timeline Highlights) —
  currently `Idea` / tagged `Maturity Dependent`, `Foundation Dependent`,
  blocked on KD-048 existing. Since KD-048 Phases 1-3 are now Done, KD-015
  is unblocked for its *foundation* (real event data exists to build a
  Timeline over). It's a looser relationship than originally drafted
  here, though: Timeline is **not** a Surface Score consumer (see
  "Destination thresholds" above — an earlier draft of this ticket
  wrongly gave it a threshold) since it isn't picking a single best
  event, it's building a progression/snapshot view over time. What this
  ticket does still feed it is the significance *classification* itself
  (Phase 4's per-event HIGH/NORMAL/LOW/IGNORE table) as one plausible
  input to whatever snapshot mechanism KD-015 designs — not the scoring
  or thresholds. KD-015 remains its own, separately-scoped, **low
  priority** design pass; worth revisiting its tags now that KD-048's
  foundation exists, but not worth pulling forward on the strength of
  this ticket alone.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card, Done) and the
  Kinesis Link card's History peek (shipped since KD-042 closed) — the
  existing integration points Phase 4's scoring pass would filter for.
* **Precedent:** ADR-010 — `isGoalOverdue`'s pure-function-over-stored-facts
  pattern, which `classifyEventSignificance` is designed to follow.
