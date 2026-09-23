# KD-052 — Event Significance, Surfacing & Change Awareness

**Status:** Accepted
**Priority:** Low
**Tags:** Architecture, UX / UI, Data Model

## Summary

KD-048 (Object Event Model) shipped Phases 1-3 in full: every core module
and Custom Items write a complete, typed `ObjectEvent` stream, read
unfiltered and unscored everywhere it's shown today (a History section,
the dashboard's Recent Activity feed, and now the Kinesis Link card's own
History peek). KD-048's other phases never started, and never had proper
planning done for them either — each was named in a single paragraph and
left there. **This ticket exists to plan the rest of that work: re-aligning
the priorities first, then making the technical decisions**, rather than
treating what's left as a quick follow-on to a now-finished ticket.

That re-alignment changes the phase numbering itself, not just what's
behind each phase — **KD-048's own Phase 5 (Timeline) has been pulled
out of this ticket entirely** (see below), so what KD-048 called Phase 6
is renumbered Phase 5 here. Two phases remain in scope for this ticket:

* **Phase 4 — Significance & surfacing.** A pure classifier deciding
  which events are worth surfacing *beyond* a plain chronological list,
  feeding a deterministic scoring pass that decides what a given UI
  surface shows. **This phase is now fully specified below** — a
  concrete per-event significance table across every module, plus a v1
  "Surface Score" algorithm and the destination thresholds that consume
  it. Not yet implemented.
* **Phase 5 — Change Awareness (regression detection).** A layer
  beyond a raw diff: knowing whether a change is a *regression* for
  that specific field (an expiry moving earlier is bad; a savings
  target moving earlier is good). Still deterministic, still
  unscheduled and unscoped beyond the one paragraph below — this
  ticket update does not touch it beyond the renumbering. AI-narrated
  summaries, which used to be bundled into this phase under its old
  KD-048 numbering, are explicitly **not** part of this ticket at all
  anymore — see the note at the end of Phase 5.

**KD-048's original Phase 5 (Timeline / Year in Review) is deliberately
not part of this ticket at all** — not renumbered, not touched, fully
out. (Watch the numbering here: this ticket's own "Phase 5" above is
Change Awareness, KD-048's old Phase 6 — a different phase entirely
from KD-048's original Phase 5, which is Timeline and is what the rest
of this paragraph is about.) Timeline already has its own ticket,
**KD-015 ("Kinesis Year in Review / Timeline Highlights")**, which
already names KD-048 as its dependency. Timeline is a
different kind of surface and will be planned separately as part of KD-015.

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
  place that already knows every event type's shape** — a natural home
  for `classifyEventSignificance` to live *alongside*, the same way
  `numericDirection`/`relationshipIconKey` already live next to the
  rendering logic they support. It should stay its own exported,
  standalone function there, not folded into `describeObjectEvent`
  itself — a consumer that only wants "is this worth surfacing," not
  title/detail text, shouldn't have to call through the renderer to
  get it (see Phase 4's design principles).
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

### Design principles

Two, not one:

1. **Deterministic and boring internally**, even where the result
   should feel smart. Every score is reconstructable by hand from the
   event's own stored fields plus the rules below — no learned
   weights, no hidden state. When Kinesis surfaces something that
   looks wrong, the fix is reading this table, not debugging a black
   box.
2. **Centralized and reusable, not surface-specific.** The
   classifier (`classifyEventSignificance`) and the Surface Score
   calculator built on top of it are each one small, composable domain
   function, living in one place with a single source of truth — not
   duplicated per consumer, and not written just for the Kinesis Link
   peek or Dashboard. Anything that later wants "is this event worth
   surfacing" — a notification, an API, Timeline, something not built
   yet — calls the same function rather than re-implementing the
   policy. This ticket builds that function; it does not decide who
   ends up calling it, or how.

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

#### Item creation (every module)

| Change | Significance |
|---|---|
| `ITEM_CREATED`, for a standalone record (Document, Goal, Todo, Person, Custom Item) | LOW |

Closes a gap the coverage audit flagged: `ITEM_CREATED` fires on every
module and had no row anywhere before this. A new record appearing is
routine, not urgent — LOW, the same tier as a cosmetic edit like
Notes. **Milestone added is the deliberate exception**, sitting at
NORMAL in the Goal table below rather than here: a milestone isn't a
standalone record, it's a sub-object created *against* an existing
Goal, so its creation is more relevant to that goal's own story than
an ordinary new record is on its own — worth the higher tier precisely
because of what it's attached to, not despite being "just a creation."

#### Ad-hoc / custom fields (every module) — NORMAL, for now

| Change | Significance |
|---|---|
| A custom field added or updated on a system module (Document, Goal, Todo, a Custom Item's own ad-hoc fields, Custom Module template fields — including Currency/Percent-formatted ones) | NORMAL |
| ...where that custom field is itself a Kinesis Link using a recognized system relationship (Supports, Blocks, Depends on, etc.) | Per the Kinesis Link relationship type table below instead — not this row |
| ...where that custom field is itself a Kinesis Link with a CUSTOM (free-text) type | NORMAL either way (matches "Any other custom Kinesis Link" below) |

Closes the other gap the coverage audit flagged: every table below is
an exhaustive list of *named* fields, but a large share of real
traffic is ad-hoc — Documents/Goals/Custom Items' own free-form
`ObjectField`s and Custom Module template fields are all keyed by an
opaque per-instance id (`diffObjectFields`), not a literal name the
classifier can look up by. There was no default for "a field I don't
recognize" before this. NORMAL is the v1 default for all of it — not
LOW (a real value changed, worth more than a cosmetic Notes edit) and
not HIGH (no way to know a given custom field is actually important
without letting the owner say so, which doesn't exist yet — see
"Deferred to a future ticket" under Open Questions).

#### Finance — Asset / Liability

| Change | Significance |
|---|---|
| Notes | LOW |
| Name | LOW |
| Category | NORMAL |
| Balance increase or decrease | HIGH¹ |
| Interest rate increase or decrease | HIGH |
| Monthly payment increase or decrease | HIGH |

#### Finance — Income / Expense

| Change | Significance |
|---|---|
| Notes | LOW |
| Name | LOW |
| Category | NORMAL |
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
| Custom Kinesis Links | NORMAL |
| **Document entering its reminder window** (automatic, system-detected — already implemented as `DOCUMENT_EXPIRING_SOON`) | **HIGH** |
| Archived (Active -> Archived) | HIGH |
| Restored (Archived -> Active) | HIGH |

Archived/Restored map onto the existing `ITEM_ARCHIVED`/`ITEM_RESTORED`
event types, which Documents share with Custom Items (see the coverage
audit) — this HIGH tier applies wherever those two event types are
written, not just for Documents. This is a deliberate contrast with
Goal's own Archived, which is NORMAL below: different module, different
semantics. A Document going in or out of its archive is closer to a
status/lifecycle transition a user actively cares about tracking (an
expired passport finally renewed and archived, or an archived one
pulled back out because it's needed again), where a Goal being archived
is more often a quiet, administrative cleanup action — see the Goal
section's own rationale for why that one stays NORMAL. Not an
inconsistency between the two tables; the two "archived" concepts mean
different things in each module.

#### Goal

Status is one `status` column with four values (Active, Revisit Later,
Finished, Archived) — not a boolean `archived` flag the way Documents
and Custom Items work. Moving *to* "Finished" already writes its own
dedicated event (`GOAL_COMPLETED`), not a generic `STATUS_CHANGED` row
— every other transition between the four values is `STATUS_CHANGED`,
and not all of them deserve the same weight:

| Change | Significance |
|---|---|
| Completed (-> Finished) | HIGH |
| Reopened (any status -> Active) | HIGH |
| Moved to Revisit Later | NORMAL |
| Archived | NORMAL |
| Target date changed | HIGH |
| Milestone added | NORMAL |
| Milestone updated | LOW |
| Milestone completed | HIGH |
| Milestone reopened (completed -> not completed) | HIGH |
| Milestone deleted | NORMAL |
| Measurable target added | HIGH |
| Measurable target updated (target value or current value) | HIGH |

**Completed and Reopened are HIGH; Revisit Later and Archived are
NORMAL, deliberately not the same tier**, even though three of the
four are just `STATUS_CHANGED` rows underneath (only Completed already
has its own event type). Completing or reviving a goal are genuinely
notable, low-frequency moments. Archiving and deferring are quieter,
more administrative, and can happen in a batch (a cleanup pass
archiving several stale goals in one sitting) — scoring those HIGH
would flood the peek/Dashboard's single-best-pick surfaces with
competing archival noise the same way unconditional Finance balance
scoring did before the magnitude dead zone, just from bulk human
action instead of automatic system writes. It also cuts against
KD-015's own stated principle to avoid framing inactivity negatively —
an Archived goal doesn't need a HIGH spotlight moment.

Implementation note: "Milestone added/updated/completed/reopened/deleted"
map directly onto the
`GOAL_MILESTONE_ADDED`/`UPDATED`/`COMPLETED`/`REOPENED`/`DELETED` event
types, and Goal-level Completed maps onto the existing `GOAL_COMPLETED`
type — none of those five need any new classifier logic, their event
type alone already says HIGH/NORMAL/LOW as listed above
(`GOAL_MILESTONE_REOPENED` is already implemented and always HIGH,
unconditionally — unlike the Goal-level "Reopened" row below, it has no
value to inspect). Goal-level Reopened, Revisit Later, and Archived are
the three that stay generic `STATUS_CHANGED` rows and need the
classifier to inspect the value:

```text
eventType === "GOAL_COMPLETED"                        -> HIGH
eventType === "STATUS_CHANGED":
  newValue === "Active" && oldValue !== "Active"       -> HIGH   (Reopened)
  newValue === "Revisit Later"                         -> NORMAL
  newValue === "Archived"                              -> NORMAL
```

No new event type or migration needed for any of this. "Reopened"
deliberately checks *any* prior status, not just `oldValue ===
"Finished"` — Goals can move Archived -> Active or Revisit Later ->
Active directly, and both should count as a reopen the same as
un-finishing one. Whether Reopened is worth its **own dedicated event
type** purely for nicer History/peek copy (the way `GOAL_COMPLETED`
already exists) rather than staying this classifier-side
`STATUS_CHANGED` special case is a separate, still-undecided question
— see Open Questions.

#### Todo

| Change | Significance |
|---|---|
| Completed (`TODO_COMPLETED`) | HIGH |
| Reopened (`TODO_REOPENED`) | HIGH |
| Status changed (To Do <-> Waiting, `STATUS_CHANGED`) | HIGH |
| Due date added or changed | HIGH |
| Notes added or changed | LOW |
| Title changed (`name` field) | LOW |

Closes the "Todo entirely unclassified" gap the coverage audit flagged.
Todo has no archive concept of its own (no `archived` column on the
model at all), so there's no Archived/Restored row here the way there
is for Document. Todo's own Kinesis Links go through the universal
Kinesis Link relationship type table below like every other module's —
nothing Todo-specific about link scoring.

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
| Any other custom Kinesis Link | NORMAL |

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
| Attention | **not** this threshold, should not be effected |

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

## Phase 5 — Change Awareness (unscheduled)

Still deterministic, still unscheduled and unscoped beyond KD-048's
original one-paragraph mention. Unaffected by this update — Surface
Score is a *volume/relevance* ranking, not a *good/bad* judgment, and
this stays independent of it (see Open Questions):

* **Per-domain regression detection** — e.g. "insurance expires earlier
  than before," a metric trending the wrong way. This is a step beyond
  a raw diff or even significance scoring: it requires knowing, *per
  field*, whether the new value is worse or better for that specific
  fact — a date moving earlier is a regression for an expiry, an
  improvement for a savings target. That polarity knowledge is
  domain-specific and would need its own classifier layered on top of
  the event stream (and on top of, or alongside, `classifyEventSignificance`
  — their relationship needs deciding, see Open Questions), not
  something the event itself can encode generically. This is a
  deterministic classifier, same spirit as everything else in this
  ticket — no model involved.

**AI is deliberately out of this ticket entirely, not just deprioritized
within it.** AI-narrated summaries used to be bundled into this phase;
they've been pulled out completely. The plan for now is to make the
deterministic Surface Score approach above as strong as it can be and
see whether that's actually good enough on its own — it may turn out
Kinesis never needs an AI layer for this at all. AI summarization is
not being designed, scoped, or planned here; if it ever becomes worth
doing, that's a future ticket of its own, decided only after the
deterministic approach has been tried and found wanting, not before.

## Open questions

* **Where does "last viewed" tracking actually belong?** New table
  keyed by `(userId, objectId)`, or something narrower? Which views
  write it, and at what cost (a write on every detail-page load, across
  every module, is a real amount of new traffic)? Still blocks Attention
  using this scoring work at all — Attention deliberately does **not**
  consume the Surface Score thresholds above and needs its own
  algorithm once this exists.
* **How does Phase 5's per-domain regression classifier relate to
  Phase 4's `classifyEventSignificance`?** Same function extended with
  polarity, two independent classifiers consulted together, or a
  Phase 5 concept that doesn't need Phase 4 to exist first at all? Not
  decided in KD-048's original text — needs deciding here.
* **Should "Goal reopened" get its own event type** (`GOAL_REOPENED`,
  mirroring `GOAL_COMPLETED`), **or stay a classifier-side special case**
  on `STATUS_CHANGED`'s values? Either works for scoring — the
  significance is settled (HIGH, any prior status back to Active) —
  this is purely about whether it's also worth nicer, dedicated
  History/peek copy instead of a generic "Status changed" line, the
  way `GOAL_COMPLETED` already gets for the opposite transition.
  Genuinely undecided, not leaning either way yet — worth deciding at
  implementation time rather than here.
* **Magnitude thresholds and the freshness/relevance point values are
  the stated v1 defaults, explicitly called out as tunable later** — no
  further decision needed before implementation, just noting they are
  not meant to be treated as final forever.

**Deferred to a future ticket, not yet planned:**

* **User-configurable priority for custom fields and custom Kinesis
  Links.** The "Ad-hoc / custom fields" default of NORMAL above is a v1
  stopgap, not a final answer — letting the record's own owner mark a
  specific custom field or a custom-typed Kinesis Link as more or less
  important than that default is a real feature idea, but a whole
  customization surface of its own (where would that control live, does
  it apply per-field or per-instance, how does it interact with the
  fixed tables above). Not designed, not scoped, not planned yet.
* **Broader planning for what to do with Relationship significance.**
  The Kinesis Link relationship type table above covers the common
  case, but doesn't resolve everything: `RELATIONSHIP_CHANGED` (a link
  being retyped) carries both an old and a new relationship type on the
  same event row, and this ticket doesn't say which one — or some
  combination — should drive its significance. That needs more thought
  than a quick table lookup and is being left for a future ticket
  rather than guessed at here.

## Related

* **Builds on:** KD-048 (Object Event Model) — Phases 1-3, Done. This
  ticket is exactly the re-planning of what KD-048's own doc deferred
  as Phases 4 and 6 (renumbered 4 and 5 here — see Summary) rather than
  treating it as in-scope follow-on.
* **Feeds:** KD-015 (Kinesis Year in Review / Timeline Highlights) —
  currently `Idea` / tagged `Maturity Dependent`, `Foundation Dependent`,
  blocked on KD-048 existing. Since KD-048 Phases 1-3 are now Done, KD-015
  is unblocked for its *foundation* (real event data exists to build a
  Timeline over). It's a looser relationship than originally drafted
  here, though: Timeline is **not** a Surface Score consumer (see
  "Destination thresholds" above — an earlier draft of this ticket
  wrongly gave it a threshold) since it isn't picking a single best
  event, it's building a progression/snapshot view over time. What this
  ticket hands over instead is `classifyEventSignificance` itself — a
  small, composable, reusable domain function (Phase 4's design
  principles above), available for KD-015 to call if it wants the same
  HIGH/NORMAL/LOW/IGNORE classification as an input to whatever
  snapshot mechanism it designs. Whether it does, and what that
  mechanism actually is, are **KD-015's own decisions**, tracked there,
  not here. KD-015 remains its own, separately-scoped, **low priority**
  design pass; worth revisiting its tags now that KD-048's foundation
  exists, but not worth pulling forward on the strength of this ticket
  alone.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card, Done) and the
  Kinesis Link card's History peek (shipped since KD-042 closed) — the
  existing integration points Phase 4's scoring pass would filter for.
* **Precedent:** ADR-010 — `isGoalOverdue`'s pure-function-over-stored-facts
  pattern, which `classifyEventSignificance` is designed to follow.