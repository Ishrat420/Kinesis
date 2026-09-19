# KD-048 — Object Event Model (Universal History & Change Log)

**Status:** Accepted — Needs Planning
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI

## Problem

Kinesis has exactly one audit trail today, `ActivityEvent`:

```prisma
model ActivityEvent {
  id, action, moduleName, objectName, icon, href, userId, createdAt
}
```

It is a flat list of pre-rendered sentences ("Added a Document named
Passport"), not a record of *what changed*:

* It is keyed by a raw `href` string, not `objectId` — there is no FK to the
  universal `Object` layer KD-023/KD-024 already built. `getActivityForHref`
  matches on that string, so it only works for the one page (Document detail)
  that happens to call it with the right href.
* It never stores an old/new value. "Updated" is the only verb for an edit —
  it cannot say status went from Active to Finished, or a balance moved from
  $10,000 to $20,000.
* It is written from a handful of hand-picked call sites (`app/(app)/{documents,goals,todos,finance,custom-modules}/actions.ts`,
  `lib/data/capture.ts`) using `Added | Updated | Completed | Converted` as
  the entire vocabulary. Most edits across the app emit nothing at all.
* It has exactly two readers: the dashboard's "Recent activity" widget and
  the Document detail page's own history list. Nothing else can build on it.
* It says nothing about whether a change is *worth* surfacing anywhere else
  — every entry reads with the same weight.

We already have the right anchor to fix this: every module record —
Document, Goal, FinanceItem, Person, Todo, and every **Custom Item** —
hangs off a single row in the universal `Object` table via a 1:1 `objectId`
(KD-023/KD-024). Nothing currently writes a structured event against it.

## Goal

Model "what happened to an object" as a first-class, typed, append-only
event stream — not another paragraph-shaped log — so one durable source of
truth can feed several different presentations without each of them
re-deriving "what changed" from scratch:

* Change Awareness
* Attention
* Dashboard activity
* Decision snapshots
* AI summaries (eventually)
* A Timeline (KD-015 is already waiting on exactly this)

And so that asking "what's the latest, meaningful thing that happened to
*this* object" has one real answer, usable from an object's own page, a
Kinesis Link preview card, or a cross-object feed — including from a custom
module item, not just the built-in modules.

This ticket is architecture + planning only. No code.

## Architecture

### Data model

```prisma
model ObjectEvent {
  id       String @id @default(uuid())
  objectId String
  object   Object @relation(fields: [objectId], references: [id], onDelete: Cascade)
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  eventType ObjectEventType

  // Set for a field-level change. `fieldKey` is a stable identifier -- a
  // fixed name ("status", "balance") for a core column, or the ObjectField's
  // own id for a custom field. `fieldLabel` is a snapshot of the human label
  // at write time, same reasoning as ActivityEvent.objectName today: a
  // custom field can be renamed or deleted later, and the event should keep
  // reading sensibly when that happens.
  fieldKey   String?
  fieldLabel String?
  oldValue   String?
  newValue   String?

  // Set only for relationship/link-shaped events -- the *other* object.
  // relatedObjectId goes null if that object is later deleted; relatedObjectName
  // is a snapshot so the line still reads ("Depends on -> Save $30k") even then.
  relatedObjectId   String?
  relatedObject     Object? @relation("ObjectEventRelated", fields: [relatedObjectId], references: [id], onDelete: SetNull)
  relatedObjectName String?

  source     ObjectEventSource
  occurredAt DateTime @default(now())

  @@index([objectId, occurredAt])
  @@index([userId, occurredAt])
}

enum ObjectEventType {
  FIELD_CHANGED           // the general-purpose fallback: any field without its own named event yet
  STATUS_CHANGED          // worth its own type -- every consumer in the list above cares about status specifically
  RELATIONSHIP_ADDED
  RELATIONSHIP_REMOVED
  RELATIONSHIP_CHANGED    // KD-050's "Change relationship" -- retyping an existing Kinesis Link in place, not add+remove
  DOCUMENT_ARCHIVED
  DOCUMENT_RESTORED
  TODO_COMPLETED
  TODO_REOPENED
  GOAL_MILESTONE_COMPLETED
  GOAL_COMPLETED
  ITEM_CREATED
  ITEM_DELETED
}

enum ObjectEventSource {
  USER
  SYSTEM
}
```

Notes on the choices, since the sketch in the ask leaves some of this open:

* **`objectId` on the universal `Object`, not a per-module join table.**
  This is the entire reason KD-023/024 exist: one FK gives every current
  module *and every future custom module* history for free, with no new
  table per module.
* **Two flavours of event, deliberately.** The examples given —
  `FIELD_CHANGED / status: Active → Finished` sitting next to
  `TODO_COMPLETED` — are already a mix of a generic diff carrier and a
  handful of *named* domain moments. Keep both: `FIELD_CHANGED` (and
  `STATUS_CHANGED`, since status is the one field almost every consumer
  cares about by name) is the fallback nothing has to be taught about in
  advance; `TODO_COMPLETED`, `GOAL_MILESTONE_COMPLETED`, etc. exist because
  "a to-do went from TODO to DONE" reads worse in every future UI than
  "Completed". Add a new named type when a moment earns one; don't feel
  obliged to give every column its own enum value.
* **Values are strings, formatted at read time.** `ObjectField.value` is
  already stored as a plain string regardless of its declared type
  (TEXT/NUMBER/DATE/CHECKBOX/LINK/KINESIS_LINK) — this mirrors that
  existing pattern instead of inventing a second typed-value system.
  Currency/date formatting happens where every other read-time value is
  formatted (`resolveFormatPreferences`, `displayNumber`), not baked into
  the stored row.
* **Snapshots (`fieldLabel`, `relatedObjectName`) for anything that can be
  renamed or deleted out from under the event.** This isn't new —
  `ActivityEvent.objectName` already does exactly this today. Same
  reasoning, applied consistently.

### Kinesis Links: what a link event actually records

This ticket's original sketch already reserved `RELATIONSHIP_ADDED` /
`RELATIONSHIP_REMOVED` and the `relatedObjectId`/`relatedObjectName` pair for
exactly this, but it predates KD-049/KD-050 actually shipping, so it never
worked out three things a real Kinesis Link needs: which *label* to show,
whose history the event belongs to, and what happens when someone *retypes*
a link rather than adding or removing one. All three matter directly to
"Blocked by" / "Depends on" reading correctly, so worth settling now rather
than leaving them for whoever implements Phase 1 to guess at.

**1. The label is a snapshot in `fieldLabel`, not a new column.** A Kinesis
Link's label (KD-049 §3/§5) is already resolved at *read* time from
`(type, inverse-or-not, customLabel)` — `kinesisLinkLabel` — everywhere else
it's shown, and `ObjectEvent` shouldn't invent a second way to store the same
information. Reuse `fieldLabel` for the already-resolved text ("Depends on",
"Blocked by", or the literal Custom text) at the moment the event is
recorded. Canonical labels never change, but a Custom label's text can be
edited later via retype, so this is a genuine snapshot in the same spirit as
`ActivityEvent.objectName` and `fieldLabel` elsewhere — the event should
still read "Depends on -> Save $30k" correctly even if that link is later
retyped to something else entirely, or the label vocabulary itself is ever
revised. `relatedObjectId`/`relatedObjectName` are exactly what they already
are: the other end of the link.

**2. One relationship change writes two `ObjectEvent` rows, one per
endpoint — a deliberate exception to "one row, derived perspective."**
Everywhere else in Kinesis (`ObjectRelationship` itself, `KinesisLinks.tsx`),
a link is one canonical row and each side's *label* is derived at query time
from which end you're looking from — that's the whole point of not storing
the inverse twice. `ObjectEvent` can't reuse that trick: its read model is
strictly single-object-scoped (`getObjectEvents(objectId)`, indexed on
`[objectId, occurredAt]`), not a graph query that can resolve perspective on
demand. Since a Kinesis Link is meant to show up in *both* linked objects'
own pages (KD-049 §4 — a flat list read from each object's own side), it has
to show up in both objects' *history* too, or a link only shows a record on
one side while looking added-from-nowhere on the other. Concretely, adding
"Goal A `DEPENDS_ON` Goal B" writes:

```text
Event on A: RELATIONSHIP_ADDED, fieldLabel="Depends on",   relatedObjectId=B
Event on B: RELATIONSHIP_ADDED, fieldLabel="Required for", relatedObjectId=A
```

Both rows describe the same real-world change from each object's own side —
they are two independent facts, not correlated by a shared id, and nothing
today needs to merge them back into "one edit" across two histories. Custom
labels are the simple case here: since KD-049 §6 shows identical text on
both sides (no forward/inverse split), both rows just get the same
`fieldLabel`. Remove follows the same pairing with `RELATIONSHIP_REMOVED`.

**3. Retyping an existing link (KD-050's "Change relationship") is
`RELATIONSHIP_CHANGED`, not a remove-then-add.** Before KD-050, a Kinesis
Link's type was fixed once created; KD-050 added an in-place "Change
relationship" control to `KinesisLinks.tsx` that updates the same
`ObjectRelationship` row's `type`/`customLabel` via `updateKinesisLinkAction`.
Modeling that as delete-then-recreate would read as "the link to Save $30k
was removed, then a different link to Save $30k was added a moment later" —
technically true of the rows, false to what actually happened. A dedicated
type keeps it one event, shaped like `FIELD_CHANGED`: `oldValue`/`newValue`
hold the old/new resolved label text (again per-endpoint, so both sides read
their own before/after correctly — "Depends on -> Alongside" on A's history,
"Required for -> Alongside" on B's), `relatedObjectId`/`relatedObjectName`
stay pointed at the same other end throughout, since retyping never changes
*what's* linked, only *how*.

**4. Emission lives in the three actions every Kinesis Link already goes
through.** This supersedes Phase 1's original, vaguer "wherever
`ObjectRelationship` rows are created/deleted" — post-KD-049/050 there's a
single, already-generalized chokepoint per action:
`addKinesisLinkAction`/`updateKinesisLinkAction`/`removeKinesisLinkAction`
(`app/actions.ts`). Each already has both endpoints' ids and the
type/customLabel in hand (it just wrote or is about to write the
`ObjectRelationship` row itself), so resolving both perspectives' labels and
writing the paired rows costs one small helper, not a new data-fetch. A
to-do's own incidental link (the bare `RELATES_TO`/`CONCERNS` row
`lib/data/todos.ts` creates when something is linked to a to-do — KD-049's
Problem §1) goes through `ObjectRelationship` too, so it emits the same
paired `RELATIONSHIP_ADDED` for consistency, but with no meaningful label to
snapshot (today it renders as "just a bare chip," per KD-049) — leave
`fieldLabel` unset there rather than inventing one, and let
`classifyEventSignificance` (Phase 4) key on its absence to keep these "low"
rather than mistaking an incidental to-do link for a deliberate Kinesis
Link.

### Emission: where events get written

Two options, and a recommendation:

1. **A generic interceptor** (Prisma middleware/`$extends`) that diffs any
   `update()` automatically. Comprehensive and hard to forget, but it can't
   know a human field label, can't tell a meaningful change from a
   bookkeeping one (`updatedAt`, internal template plumbing), and would
   happily log everything — which is precisely the "prettier audit log"
   outcome this ticket is trying to avoid, just automated instead of manual.
2. **Explicit emission at the same chokepoints `addActivity` already lives
   at today** (`app/(app)/{documents,goals,todos,finance,custom-modules}/actions.ts`,
   `lib/data/capture.ts`) — these are exactly the moments someone already
   decided were activity-worthy. Extending them to also record a typed,
   diffed `ObjectEvent` — rather than only a rendered sentence — is a small,
   deliberate change per call site, and it naturally excludes noise because
   nothing is emitted unless a human decided the moment deserved it.

**Recommendation: (2).** The code at each of those call sites already has
the "before" value in hand (it fetched the row for an ownership check, or
holds the previous value locally), so capturing `oldValue`/`newValue` there
costs little extra. Add one small write helper
(`lib/data/object-events.ts` → `recordObjectEvent(...)`) so adding emission
to a new call site is a one-line addition, and revisit with a lint or test
level check ("does this action file touch a model with an Object identity
without recording an event?") once coverage gaps show up in practice —
rather than a runtime interceptor that can't distinguish signal from noise.

### Significance — "is this worth surfacing elsewhere"

Don't store a score. Add a small, pure, read-time classifier —
`classifyEventSignificance(event): "low" | "normal" | "high"` — driven by
`eventType` + `fieldKey`, the same way `isGoalOverdue` is a pure function
over stored facts rather than a persisted flag (ADR-010's own precedent).
Keeps the policy centralized and changeable without a migration. Starting
point: `GOAL_COMPLETED` / `DOCUMENT_ARCHIVED` / `STATUS_CHANGED` = high; a
`FIELD_CHANGED` on a notes/description-shaped field = low. Percentage-based
thresholds for numeric fields (a balance moving >10%) are a reasonable
later refinement, not required to ship Phase 1.

### How this maps onto the consumers named in the ask

* **Timeline** — reads `ObjectEvent` directly, curates by significance and
  date range. **KD-015 ("Kinesis Year in Review")** is an existing, currently
  `Idea` / `Maturity Dependent` ticket whose entire example output
  ("Savings increased $7,000 → $17,000", "Milestone completed") is exactly
  what this model produces. It has almost certainly been blocked on there
  being no event substrate to build from — recommend re-tagging it once
  Phase 1–3 below exist.
* **Dashboard activity** — replaces the "Recent activity" widget's current
  `ActivityEvent` read with an `ObjectEvent` one (Phase 2).
* **Attention** — not a new due-date source (Attention's overdue/due-soon
  model is unrelated to this), but "this changed since you last looked" is
  a plausible future Attention reason. It needs a "last viewed" concept
  that doesn't exist anywhere in Kinesis today — flagged as future work,
  not part of this ticket.
* **Decision snapshots** — no such feature exists yet either; noted as a
  future consumer only, per the ask.
* **Kinesis Link preview cards (KD-042)** — a "Latest: …" line becomes
  possible once significance scoring exists (Phase 4).
* **AI summaries** — consumes the same read API as Timeline; needs nothing
  event-model-specific beyond the stream being complete and well-labelled.
* **Change Awareness** (e.g. "insurance expires earlier than before") is a
  step beyond a raw diff: it requires knowing, per field, whether the new
  value is a *regression* — a date moving earlier is bad for an expiry, good
  for a target. That's a per-domain classifier layered on top of the event
  stream, not something the event itself encodes. Flagged as a distinct,
  later capability (Phase 6).

## Phases

**Phase 1 — Foundation**
Schema + migration for `ObjectEvent`/`ObjectEventType`/`ObjectEventSource`.
`lib/data/object-events.ts`: `recordObjectEvent(...)` and
`getObjectEvents(objectId)`. Wire emission into the existing
`addActivity` call sites — each one becomes *both* an `ActivityEvent`
(unchanged, so nothing regresses) *and* an `ObjectEvent` (new) — plus
`RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED`/`RELATIONSHIP_CHANGED` from
`addKinesisLinkAction`/`updateKinesisLinkAction`/`removeKinesisLinkAction`
and the to-do linking call site in `lib/data/todos.ts`, per "Kinesis Links:
what a link event actually records" above (paired per-endpoint rows,
snapshotted label in `fieldLabel`). Ship one visible consumer: a generic
"History" section on object detail pages, starting with Documents, Goals
and Custom Items (Documents already has a bespoke one to replace) — a
Kinesis Link add/remove/retype should be visible in this section on both
linked objects' pages, not only the one where the action happened. No
significance scoring yet — newest first, unfiltered.

**Phase 2 — Replace `ActivityEvent`**
Move the dashboard "Recent activity" widget onto `ObjectEvent`. Move
Document's own history onto the generic Phase-1 section (retire
`getActivityForHref`). Extend the History section to every remaining
object detail page (Todos, Finance, People/Relationships) so "everywhere"
is actually true. Retire `ActivityEvent` / `lib/data/activity.ts` once
nothing reads it — one source of truth, not two logs drifting apart.

**Phase 3 — Custom module coverage**
`ObjectField` is fully dynamic, so this needs a generic "did this field's
value change" diff at the point a Custom Item's fields are saved, keyed by
`ObjectField.id` with a `fieldLabel` snapshot — rather than named columns
the way core modules get in Phase 1. Cover Custom Item creation/archival/
deletion the same way.

**Phase 4 — Significance & surfacing**
Add `classifyEventSignificance`. Feed "high" events into Kinesis Link
preview cards. Reconsider an Attention "changed" reason (needs "last
viewed" — likely its own small ticket).

**Phase 5 — Timeline / Year in Review**
Build KD-015 on top of the now-populated log: period grouping, highlight
selection, celebratory copy per KD-015's own notes. Re-tag KD-015 off
`Maturity Dependent` once Phases 1–3 exist to review.

**Phase 6 — Change Awareness & AI summaries (unscheduled)**
Per-domain regression detection ("expires earlier than before", a metric
trending the wrong way). AI-narrated summaries over the same stream.

## Behaviour / constraints

* Recording an event must never fail the action that caused it — a write
  failure here should be logged and swallowed, not surfaced as a
  user-facing error on, say, marking a to-do done.
* Deleting an object cascades its own events (`onDelete: Cascade` on
  `objectId`). An event where that object was only the *related* side (X
  depends on Y, Y gets deleted) survives on X, falling back to the
  snapshotted `relatedObjectName` once `relatedObjectId` goes null.
* No new size limit invented here — `ObjectEvent.oldValue`/`newValue`
  should simply follow whatever cap **KD-043 (Field Length Limits)**
  settles on for values generally, rather than a bespoke one.
* Additive and staged, same principle KD-023 already commits to: no phase
  requires a one-shot migration; each can ship and prove itself before the
  next begins.

## Open questions

* Does `ObjectEventSource` need more than `USER`/`SYSTEM` before a second
  system-driven writer actually exists? Defer.
* During the Phase 1–2 overlap window, does the dashboard read from both
  logs or just the old one? Proposed: just the old one — Phase 1
  deliberately doesn't touch the dashboard.
* Retention: nothing else in Kinesis trims historical data today: default
  `ObjectEvent` to "kept forever" and revisit only if storage becomes a
  real concern.

## Related

* **Builds on:** KD-023 (Universal Object Connections), KD-024 (Universal
  Object Capability Layer) — the `Object` identity layer this hangs off.
* **Builds on:** KD-049 (Typed Kinesis Links), KD-050 (Converge Kinesis Link
  Custom Fields) — both shipped since this ticket's schema was first
  sketched, and directly shaped the relationship-event design above:
  `kinesisLinkLabel`'s forward/inverse/custom resolution is what
  `RELATIONSHIP_ADDED`/`REMOVED`'s `fieldLabel` snapshots, and KD-050's
  in-place "Change relationship" control is why `RELATIONSHIP_CHANGED`
  exists as its own type rather than a remove-then-add pair.
* **Feeds:** KD-015 (Kinesis Year in Review / Timeline) — very likely
  blocked on exactly this.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card) — future
  significance surfacing.
* **Follows the cap set by:** KD-043 (Field Length Limits).
* **Supersedes:** `ActivityEvent` / `lib/data/activity.ts` (retired in
  Phase 2).
* Once Phase 1's shape is accepted, this should get its own ADR — the same
  way notifications got ADR-010 — since "what counts as an event, and who's
  allowed to read one" is a decision, not just a work item (per this
  backlog's own ADR-vs-backlog distinction).
