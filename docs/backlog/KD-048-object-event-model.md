# KD-048 — Object Event Model (Universal History & Change Log)

**Status:** In Progress -- Phase 1 shipped in full, including its own
remainder (every named event type wired across every module's mutations,
not just Kinesis Links and deletion). Phase 2's one visible piece --
extending the History section to every remaining object detail page -- is
now partly done out of sequence: Finance Items and To-Dos each got a real
detail page/window with History wired in (see below), ahead of the
`ActivityEvent`-retirement work Phase 2 was otherwise about. People/
Relationships still has no detail page to hang History off. Phases 3-6 not
started.

**Finance Items and To-Dos detail pages (shipped, ahead of Phase 2):**
Both modules previously had no per-item route at all -- editing was
entirely inline/modal, with no read view to hang a History section off.
Each now has a real page (`/finance/[itemId]`, `/todos/[todoId]`), reached
directly, by refresh, or by a shared link, plus an intercepted "big window"
version of the same page (Next.js intercepting + parallel routes, a new
`app/(app)/@modal` slot on the shared layout) opened when clicking into an
item from its dashboard/board without leaving it. Both reuse their
existing edit forms (`FinanceForm`/`TodoDetailsForm`, each extracted into
its own shared file) for the inline edit toggle, and render `ObjectHistory`
via `getFinanceItem`/`getTodo` -- new single-item getters, since only bulk
`getFinanceItems`/`getTodos` existed before. Two deliberate scope calls documented in the To-Dos commit: no
generic Kinesis Links management card (the existing bespoke "concerns"
picker stays the only way to edit a To-Do's links, to avoid two UIs
writing the same `ObjectRelationship` rows), and no delete confirmation
(matching the board's existing behaviour). Not done: `lib/objects/
locations.ts`'s `locateObject` still points Kinesis Link cards at the list
page for both modules (`/finance`, `/todos#todo-<id>`) rather than the new
per-item routes -- left unchanged deliberately, matching how Finance's own
dashboard rows got a direct `<Link>` without touching that shared
function.
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI

**Phase 1 status:** Shipped. `ObjectEvent`/`ObjectEventType`/`ObjectEventSource`
added (`20261009000000_object_event_model`), exactly as designed above,
including the three review fixes (raw `oldRelationshipType`/
`newRelationshipType`/`inverse` rather than a resolved-label snapshot;
`ITEM_DELETED` written onto survivors, never the deleted object itself;
paired writes wrapped in the same transaction as the mutation they describe).
`lib/data/object-events.ts` holds the write side
(`recordRelationshipAdded`/`Removed`/`Changed`, `recordItemDeletedEvents`,
`describeObjectEvent`) and takes `userId` explicitly rather than
self-authenticating, so it stays free of `@/lib/auth`'s `server-only` import
and can be pulled into `lib/data/objects.ts` without dragging that into a
plain unit test; the one self-authenticating reader, `getObjectEvents`,
lives in its own `lib/data/object-event-history.ts` for exactly that reason.

Wired into: `addKinesisLinkAction`/`updateKinesisLinkAction`/
`removeKinesisLinkAction` (`app/actions.ts`); the to-do linking paths in
`lib/data/todos.ts` (`createTodo`, and `updateTodoDetails`'s replace-all
save, which now diffs against the existing set so an untouched link records
no event); and `deleteObjects` (`lib/data/objects.ts`) itself, which is the
one chokepoint every module's delete already goes through, so `ITEM_DELETED`
coverage is universal for free rather than needing a per-module change.

**Phase 1 remainder status: Shipped.** Every named event type from the "Phase
1 remainder" plan below is now wired, per object type:

* **Documents** (`lib/data/documents.ts`) -- `ITEM_CREATED` in
  `createDocument`; `FIELD_CHANGED` in `updateDocument` for the named
  columns (`expiryDate`, `issueDate`, `documentNumber`, `country`, `notes`,
  `link`, `prompt`) plus the shared `diffObjectFields` helper for ad-hoc
  custom fields; `ITEM_ARCHIVED`/`ITEM_RESTORED` when `archived` flips
  (its own event, not a generic `FIELD_CHANGED` -- see the enum rename
  below); `STATUS_CHANGED` both as a side effect of a manual save that
  moves the computed status, and -- found while implementing, not in the
  original plan -- as a `SYSTEM`-sourced event from `getDocument`'s own
  lazy status recompute (a document crossing its expiry date between page
  views), which is the actual most common way a Document's status changes
  at all and would have gone entirely uncaptured otherwise.
* **Goals** (`goals/actions.ts`) -- `ITEM_CREATED` in `createGoalAction`;
  `GOAL_COMPLETED` (moving to `"Finished"`) or generic `STATUS_CHANGED`
  (any other transition) in `updateGoalStatusAction`; `FIELD_CHANGED` for
  the target date (`updateGoalTargetDateAction`) and
  `targetValue`/`currentValue`/`unit` together, on both setting them
  (`addTargetAction`) and clearing them entirely (`removeTargetAction`,
  closed after initially being flagged as a gap here) plus
  `diffObjectFields` in `updateGoalFieldsAction`; `GOAL_MILESTONE_COMPLETED`
  naming the milestone in `toggleMilestoneAction`.
* **To-Dos** (`lib/data/todos.ts`) -- `ITEM_CREATED` in `captureTodo` and
  `createTodo`; `TODO_COMPLETED`/`TODO_REOPENED` (moving to/from `"DONE"`)
  or generic `STATUS_CHANGED` (any other transition) plus `FIELD_CHANGED`
  for `dueDate`/`notes`, all in `updateTodoDetails`, at the exact point it
  already fetched the old status for its own purposes.
* **Custom Items** (`custom-modules/actions.ts`) -- `ITEM_CREATED` in
  `createCustomItemAction`; `FIELD_CHANGED` for `name`/`dueDate` plus
  `diffObjectFields` for ad-hoc extras in `updateCustomItemAction`; a
  separate diff inside `saveTemplateFieldValues` (keyed by
  `templateFieldId`, since that upsert-per-field shape isn't the
  delete-and-recreate pattern `diffObjectFields` assumes) covering template
  field values on both create and update; `ITEM_ARCHIVED`/`ITEM_RESTORED`
  from both `updateCustomItemAction`'s own archived toggle and the
  dedicated `toggleCustomItemArchivedAction`.
* **Finance Items** (`finance/actions.ts`) -- `ITEM_CREATED`/`FIELD_CHANGED`
  in `saveFinanceItem` for `amount`, `category`, `rate`,
  `monthlyContribution`, `frequency`, `startDate`, `endDate`, `notes`.
  `balanceAsOf` is deliberately excluded -- it changes on every save by
  design (KD-044), so it's bookkeeping, not a fact worth a History line, the
  same way `updatedAt` never gets one anywhere else. No detail page exists
  yet to show this history on (Phase 2's own job), but the data is captured
  now regardless.
* **Quick-capture conversion** (`lib/data/capture.ts`) -- confirmed still
  not mapped to its own event type, exactly as planned; the new record
  still gets a plain `ITEM_CREATED`.

**Shared `diffObjectFields` helper** (`lib/data/object-events.ts`), predicted
by Finding 2 below, shipped as designed: one id-keyed diff, reused by
Documents, Goals, and Custom Items' own ad-hoc fields, all of which save
through the identical delete-then-recreate-all pattern.

**Enum rename, resolving the "open question" below:** `DOCUMENT_ARCHIVED`/
`DOCUMENT_RESTORED` are now `ITEM_ARCHIVED`/`ITEM_RESTORED`
(`20261010000000_object_event_type_generalize_archived` -- a pure rename,
since neither value had ever been written by anything), shared by Documents
and Custom Items rather than needing a second, Custom-Item-specific pair.

**Test coverage:** `tests/unit/object-events.test.ts` (`describeObjectEvent`,
every event type, pure); `tests/integration/kinesis-links/object-relationship-links.test.ts`'s
"recording history" block (paired add/retype/remove events, correct
per-side labels, ordering); `tests/integration/objects/object-factory.test.ts`'s
"records ITEM_DELETED" block (survivor-side write, the deleted object's own
now-cascaded identity getting nothing, and the both-sides-deleted-together
skip case); `tests/integration/todos/todo-link-history.test.ts` (the
diff-not-replace behavior) and the new `todo-lifecycle-history.test.ts`
(creation, completion/reopening, field diffs); the new
`tests/integration/goals/goal-history.test.ts`,
`tests/integration/documents/document-history.test.ts` (including the
`SYSTEM`-sourced lazy status recompute), `tests/integration/custom-modules/custom-item-history.test.ts`,
and `tests/integration/finance/finance-history.test.ts`. The existing
account-wide sweep tests (`delete-all-data`, `export`) were extended to seed
and check `ObjectEvent` too, per their own "every table" convention. All
new/changed code passes `tsc --noEmit` and `eslint` cleanly; the full suite
(unit + integration) is green throughout.

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
  //
  // Also doubles for a RELATIONSHIP_CHANGED event's literal text on
  // whichever side (old/new) is a CUSTOM Kinesis Link -- that text *is* the
  // value, the same way any other free-text field's value lives here. Null
  // on a canonical-type side, since that side needs no text snapshot at all
  // (see `oldRelationshipType`/`newRelationshipType` below).
  fieldKey   String?
  fieldLabel String?
  oldValue   String?
  newValue   String?

  // Set only for RELATIONSHIP_* events -- the canonical type on each side of
  // the change, so a later query ("every DEPENDS_ON that ever appeared")
  // filters on this instead of parsing rendered text. RELATIONSHIP_ADDED
  // sets only `newRelationshipType`; RELATIONSHIP_REMOVED sets only
  // `oldRelationshipType`; RELATIONSHIP_CHANGED (KD-050's "Change
  // relationship" retype) sets both. `inverse` records which side of that
  // type *this* row is being recorded from -- needed to re-derive "Depends
  // on" vs "Required for" through the same `kinesisLinkLabel` every other
  // surface already calls, rather than storing the resolved text a second
  // time; unset for CUSTOM, which reads identically on both sides.
  oldRelationshipType ObjectRelationshipType?
  newRelationshipType ObjectRelationshipType?
  inverse             Boolean?

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

**1. Store the canonical type; derive the label at render time — don't
snapshot resolved text for canonical types.** An earlier draft of this
section proposed snapshotting the already-resolved text ("Depends on") into
`fieldLabel`, reasoned from the same "renamed or deleted out from under the
event" logic that justifies snapshotting a *custom field's* label elsewhere
in this model. That reasoning doesn't actually transfer: a custom field's
label is arbitrary text someone can rename, but a canonical Kinesis Link
label (`Depends on` / `Blocked by` / …) is a fixed vocabulary in code
(`lib/objects/relationship-labels.ts`) — there's no drift for a snapshot to
protect against, and storing it anyway just duplicates something
`kinesisLinkLabel` can always re-derive correctly, the exact thing KD-049 §3
already decided ("the label decorates the card, it doesn't belong to it")
and this model should keep applying consistently. So: store
`newRelationshipType` (on add) / `oldRelationshipType` (on remove) — the raw
`ObjectRelationshipType` — plus `inverse` (which side of that type this row
represents), and resolve the display text at read time via the same
`kinesisLinkLabel(type, inverse, customLabel)` every other Kinesis Link
surface already calls. This also makes the type itself queryable
directly ("every `DEPENDS_ON` that ever appeared") without parsing rendered
text — reading the type back out of a resolved string is fragile the moment
wording ever changes. `CUSTOM` is the one case with real text to snapshot,
since the user's typed wording *is* the value (not derived from anything) —
that goes in `newValue`/`oldValue` (see below), matching how any other
free-text value is already stored in this model, not in `fieldLabel`.
`relatedObjectId`/`relatedObjectName` are exactly what they already are: the
other end of the link.

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
Event on A: RELATIONSHIP_ADDED, newRelationshipType=DEPENDS_ON, inverse=false, relatedObjectId=B
  -> renders "Depends on -> [B]"
Event on B: RELATIONSHIP_ADDED, newRelationshipType=DEPENDS_ON, inverse=true,  relatedObjectId=A
  -> renders "Required for -> [A]"
```

Both rows describe the same real-world change from each object's own side —
they are two independent facts, not correlated by a shared id, and nothing
today needs to merge them back into "one edit" across two histories. `CUSTOM`
is the simple case: since KD-049 §6 shows identical text on both sides (no
forward/inverse split), both rows get `newRelationshipType=CUSTOM` and the
same literal text in `newValue`; `inverse` is irrelevant there since there's
nothing to resolve. Remove follows the same pairing with
`RELATIONSHIP_REMOVED`/`oldRelationshipType`. **These paired writes, plus the
underlying `ObjectRelationship` mutation, must commit as one transaction**
(see Behaviour/constraints) — otherwise a dropped second write leaves a link
that only one of the two objects ever knows happened.

**3. Retyping an existing link (KD-050's "Change relationship") is
`RELATIONSHIP_CHANGED`, not a remove-then-add.** Before KD-050, a Kinesis
Link's type was fixed once created; KD-050 added an in-place "Change
relationship" control to `KinesisLinks.tsx` that updates the same
`ObjectRelationship` row's `type`/`customLabel` via `updateKinesisLinkAction`.
Modeling that as delete-then-recreate would read as "the link to Save $30k
was removed, then a different link to Save $30k was added a moment later" —
technically true of the rows, false to what actually happened. A dedicated
type keeps it one event: `oldRelationshipType`/`newRelationshipType` (plus
`oldValue`/`newValue` when either side is `CUSTOM`) carry the raw
before/after type, same `inverse` throughout since retyping never changes
which side of the pair this row represents. The same raw pair renders
differently per endpoint, exactly as it should — retyping Goal A's link to
Goal B from `DEPENDS_ON` to `BLOCKS` writes:

```text
Event on A: oldRelationshipType=DEPENDS_ON, newRelationshipType=BLOCKS, inverse=false
  -> renders "Depends on -> Blocks"
Event on B: oldRelationshipType=DEPENDS_ON, newRelationshipType=BLOCKS, inverse=true
  -> renders "Required for -> Blocked by"
```

`relatedObjectId`/`relatedObjectName` stay pointed at the same other end
throughout, since retyping never changes *what's* linked, only *how*.

**4. Emission lives in the three actions every Kinesis Link already goes
through.** This supersedes Phase 1's original, vaguer "wherever
`ObjectRelationship` rows are created/deleted" — post-KD-049/050 there's a
single, already-generalized chokepoint per action:
`addKinesisLinkAction`/`updateKinesisLinkAction`/`removeKinesisLinkAction`
(`app/actions.ts`). Each already has both endpoints' ids and the
type/customLabel in hand (it just wrote or is about to write the
`ObjectRelationship` row itself), so writing the paired rows in the same
transaction costs one small helper, not a new data-fetch. A to-do's own
incidental link (the bare `RELATES_TO`/`CONCERNS` row `lib/data/todos.ts`
creates when something is linked to a to-do — KD-049's Problem §1) goes
through `ObjectRelationship` too, so it emits the same paired
`RELATIONSHIP_ADDED` for consistency, but with no `CUSTOM` text to snapshot
(today it renders as "just a bare chip," per KD-049) — `newValue` stays
unset there, and `classifyEventSignificance` (Phase 4) can key on the type
being the bare `RELATES_TO` used for to-do links to keep these "low" rather
than mistaking an incidental to-do link for a deliberate Kinesis Link.

### Deletion: `ITEM_DELETED` records onto survivors, not the deleted object

The schema cascades an object's own events when the object itself is deleted
(`onDelete: Cascade` on `objectId`) — that's the right default for "don't
leave orphaned rows lying around." But `ITEM_DELETED` was listed as a
recordable event type without ever saying *whose* `objectId` it belongs to,
and the obvious reading — record it on the object being deleted, so its
history's last line says "Deleted" — is self-defeating: that row would be
inserted and then cascaded away the instant the delete it's describing
commits, since it shares the same `objectId` the cascade is keyed on. It
could never actually be read back.

Resolution: **`ITEM_DELETED` is never recorded on the object being
deleted.** There's no real loss here — once an object is gone there's no
page left to view its own history on anyway. Instead, at the moment of
deletion, write `ITEM_DELETED` onto every *other* object that currently
holds a live `ObjectRelationship` to it (`objectId` = the surviving object,
`relatedObjectId` = the object being deleted, `relatedObjectName`
snapshotted) — the same enumeration a Kinesis Link add/remove already needs
(§2 above), and the same reason `relatedObjectName` exists at all: so
Goal B's history can still say "Depends on -> Save $30k (deleted)" after
Goal A is gone, rather than the link simply vanishing from B's history with
no trace it ever existed. This has to happen *before* the delete itself
commits — the relationship rows (and the ids needed to enumerate "who's
linked to this") disappear along with the object once it's actually
deleted — so it's naturally one transaction: look up every live relationship
to the object, write the paired `ITEM_DELETED` events on the other side of
each, then delete the object.

### Emission: where events get written

Two options, and a recommendation:

1. **A generic interceptor** (Prisma middleware/`$extends`) that diffs any
   `update()` automatically. Comprehensive and hard to forget, but it can't
   know a human field label, can't tell a meaningful change from a
   bookkeeping one (`updatedAt`, internal template plumbing), and would
   happily log everything — which is precisely the "prettier audit log"
   outcome this ticket is trying to avoid, just automated instead of manual.
2. **Explicit emission, starting at the same chokepoints `addActivity`
   already lives at today** (`app/(app)/{documents,goals,todos,finance,custom-modules}/actions.ts`,
   `lib/data/capture.ts`) — these are moments someone already decided were
   activity-worthy, so extending them to also record a typed, diffed
   `ObjectEvent` — rather than only a rendered sentence — is a small,
   deliberate change per call site, and it naturally excludes noise because
   nothing is emitted unless a human decided the moment deserved it.

**Recommendation: (2), but treat `addActivity`'s existing call sites as a
starting floor, not the finished coverage boundary.** They inherit exactly
the gap the Problem section already calls out — "most edits across the app
emit nothing at all" — since anywhere `ActivityEvent` was never wired up,
this wouldn't be either, by construction. A passport's expiry date moving
from 2031 to 2029 may never have been dashboard-feed-worthy, but it
absolutely belongs in that Document's history; `ObjectEvent` is answering a
different, broader question ("what happened to this object") than
`ActivityEvent` ever tried to. So: per object type, inventory the
user-facing mutation paths that change something worth remembering and make
sure each one emits, rather than assuming the existing `addActivity` sites
already are that set — start with them since the "before" value is often
already in hand there (cheap `oldValue`/`newValue` capture), but audit
outward from there per type as its own explicit step, not a "gaps will
surface in practice, deal with them then" afterthought. Add one small write
helper (`lib/data/object-events.ts` → `recordObjectEvent(...)`) so adding
emission to a new call site is a one-line addition, and keep the lint/test
level check ("does this action file touch a model with an Object identity
without recording an event?") as a backstop for whatever the manual audit
still misses — rather than a runtime interceptor that can't distinguish
signal from noise.

### Phase 1 remainder: wiring every object type (Shipped)

Written after actually reading `documents.ts`/`documents/actions.ts`,
`goals/actions.ts`, `todos.ts`/`todos/actions.ts`,
`custom-modules/actions.ts`, `finance/actions.ts`, and `capture.ts` -- not
guessed from the enum names. Two findings changed the plan from what the
"Emission" section above implies before this was worked out concretely.

**Finding 1 — emission belongs wherever the "before" value is already
read, which is not uniformly the action file.** The recommendation above
("explicit emission at the same chokepoints `addActivity` already lives
at") reads as if every module's `app/(app)/{module}/actions.ts` is that
chokepoint. It isn't, uniformly:

* **Documents** and **Custom Items** have real data-layer writers
  (`lib/data/documents.ts`'s `updateDocument`, and inline transaction
  blocks in `custom-modules/actions.ts`) that only fetch a minimal
  `{ objectId: true }` before writing -- broadening that select to also
  read the old field values is the actual change needed, and it happens in
  the writer, not the action.
* **Goals** and **Finance Items** have no separate data-layer writer at
  all -- `goals/actions.ts` and `finance/actions.ts` run their own Prisma
  calls directly. Emission there genuinely does belong in the action file,
  because that *is* where the mutation happens.
* **To-Dos** already read the "before" value for their own purposes:
  `updateTodoDetails` computes `const nextStatus = status ?? todo.status`
  after fetching `todo.status` -- the diff point already exists, unused.
  This is the cheapest of the five to wire, and the clearest proof that
  "wherever before/after naturally coexist" is the right rule, not "the
  action file" as a blanket location.

**Finding 2 — the hard part of Phase 3 ("Custom module coverage") isn't
Custom-Item-specific, and doing it once now covers three record types at
once.** Phase 3 frames a generic `ObjectField` value-diff, keyed by
`ObjectField.id`, as work specific to Custom Items, because their fields
are fully dynamic. But Documents and Goals *also* store their own ad-hoc
custom fields (TEXT/NUMBER/DATE/LINK -- KD-003/033) in the exact same
`ObjectField` table, saved through the exact same delete-all-then-recreate-
all pattern (`objectField.deleteMany` then one `create` per submitted
field) as Custom Items' own extras. Confirmed this actually diffs cleanly
across that delete-and-recreate: `prepareCustomFields` reuses each
submitted field's own `id` when the client sent one (`id ?? crypto.
randomUUID()`), and the client-side editor always resubmits an existing
field's real id -- so a field's id survives the round trip even though
every row is technically dropped and reinserted, and matching old-by-id to
new-by-id is a real diff, not a guess. **One shared helper -- e.g.
`diffObjectFields(before, after): { fieldKey, fieldLabel, oldValue,
newValue }[]`, comparing two `{id, label, value}[]` snapshots by id** --
covers Documents', Goals', and Custom Items' ad-hoc fields all at once,
built once. Custom Items' further wrinkle, *template* field values
(`saveTemplateFieldValues`'s upsert-per-field pattern, keyed by
`templateFieldId` rather than delete-and-recreate), is the one genuinely
separate piece of diff logic left for Phase 3 to still call its own.

**Per object type:**

* **Document** (`lib/data/documents.ts`) --
  `ITEM_CREATED` in `createDocument`.
  `FIELD_CHANGED` in `updateDocument`, from a named-column diff (`status`,
  `expiryDate`, `issueDate`, `documentNumber`, `country`, `notes`, `link`,
  `prompt`) plus the shared `diffObjectFields` helper for its custom
  fields -- both need `updateDocument`'s current `{ objectId: true }`
  select broadened to the old column values.
  `DOCUMENT_ARCHIVED`/`DOCUMENT_RESTORED` specifically when `archived`
  flips, rather than folding it into the generic `FIELD_CHANGED` -- it's
  already its own named type in the enum and reads better on its own line
  in History than "archived changed: false -> true."

* **Goal** (`goals/actions.ts`, no separate data-layer writer) --
  `ITEM_CREATED` in `createGoalAction`.
  `STATUS_CHANGED` in `updateGoalStatusAction`, which needs to fetch the
  old `status` first (today it's a blind `updateMany`); when the new
  status is `"Finished"`, emit `GOAL_COMPLETED` instead of the generic
  type, matching the enum's own "add a named type when a moment earns
  one."
  `FIELD_CHANGED` in `updateGoalTargetDateAction` (target date) and
  `addTargetAction` (`targetValue`/`currentValue`/`unit` -- `addTargetAction`
  already fetches `previous.currentValue` for its own snapshot logic, so
  most of the "before" work is already done) plus the shared
  `diffObjectFields` helper in `updateGoalFieldsAction`.
  `GOAL_MILESTONE_COMPLETED` in `toggleMilestoneAction`, replacing its
  existing `addActivity({ action: "Completed", ... })` call -- this one
  already reads the milestone and its goal in one query, so nothing new
  needs fetching.

* **To-Do** (`lib/data/todos.ts`) --
  `ITEM_CREATED` in `captureTodo` and `createTodo`.
  `TODO_COMPLETED`/`TODO_REOPENED` in `updateTodoDetails`, right where it
  already computes `nextStatus` against the `todo.status` it already
  fetched -- `TODO_COMPLETED` when moving to `"DONE"`, `TODO_REOPENED` when
  moving away from it, `FIELD_CHANGED` for any other status transition.
  `FIELD_CHANGED` for `dueDate`/`notes` in the same function.

* **Custom Item** (`custom-modules/actions.ts`) --
  `ITEM_CREATED` in `createCustomItemAction`.
  `FIELD_CHANGED` in `updateCustomItemAction`: named-column diff for
  `name`/`dueDate` (needs the transaction's existing `ownedItem` select
  broadened), the shared `diffObjectFields` helper for its ad-hoc extras,
  and a separate small diff inside `saveTemplateFieldValues` for template
  field values (its own upsert-per-field shape, per Finding 2 above).
  Archival, per the open question below.

* **Finance Item** (`finance/actions.ts`) --
  `ITEM_CREATED`/`FIELD_CHANGED` in `saveFinanceItem`, which needs its
  `existing` lookup broadened from `{ id: true }` to the old column
  values (`amount`, `category`, `rate`, `monthlyContribution`, `frequency`,
  `startDate`, `endDate`, `notes`) to diff against. No status or archival
  concept exists here to map onto `STATUS_CHANGED`.

* **Quick-capture conversion** (`lib/data/capture.ts`'s
  `completeCaptureConversion`) -- deliberately **not** mapped to a new
  event type this round. The `"Converted"` `ActivityEvent` action names
  both the retiring To-Do and the record it became, but there's no
  `ObjectRelationship` between them for an event to hang a `relatedObjectId`
  off -- inventing one just to carry provenance is new scope beyond what
  this remainder is for. The new record still gets a plain `ITEM_CREATED`;
  revisit only if "came from a quick capture" is ever asked for in History
  specifically.

**Open question, resolved:** `DOCUMENT_ARCHIVED`/`DOCUMENT_RESTORED` were
named for Documents specifically, but Custom Items have the exact same
boolean `archived` flag and toggle (`toggleCustomItemArchivedAction`).
Renamed to `ITEM_ARCHIVED`/`ITEM_RESTORED`
(`20261010000000_object_event_type_generalize_archived`) before either was
wired, so both modules share one pair instead of Custom Items getting a
second, near-duplicate one or falling back to a generic, less-legible
`FIELD_CHANGED`.

**Suggested order** (cheapest/lowest-risk first, and each step unlocking
more of the next): To-Do (diff point already exists) -> Goal's
`STATUS_CHANGED`/`GOAL_COMPLETED`/`GOAL_MILESTONE_COMPLETED` (also cheap,
"before" already fetched or trivial to add) -> the shared
`diffObjectFields` helper, unit-tested on its own -> Document (named-column
diff + `diffObjectFields` + archived/restored) -> Custom Item (named-column
diff + `diffObjectFields` + template-field diff + archived/restored) ->
Finance Item. Each module's own integration test file
(`tests/integration/{documents,goals,todos,custom-modules,finance}/...`)
gets new cases alongside the existing ones, matching this session's
Kinesis Link/deletion coverage rather than a new, separate test file per
event type.

### Significance — "is this worth surfacing elsewhere"

Don't store a score. Add a small, pure, read-time classifier —
`classifyEventSignificance(event): "low" | "normal" | "high"` — driven by
`eventType` + `fieldKey` (or, for `RELATIONSHIP_*` events,
`newRelationshipType`/`oldRelationshipType` — e.g. the bare `RELATES_TO` a
to-do's own linking uses stays "low", while a deliberately-chosen type like
`BLOCKS` does not), the same way `isGoalOverdue` is a pure function over
stored facts rather than a persisted flag (ADR-010's own precedent).
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

**Phase 1 — Foundation (Shipped, in full)**
Schema + migration for `ObjectEvent`/`ObjectEventType`/`ObjectEventSource`
shipped as designed, including the review fixes, plus the later
`ITEM_ARCHIVED`/`ITEM_RESTORED` generalization. `lib/data/object-events.ts`
(write side) and `lib/data/object-event-history.ts` (`getObjectEvents`,
split out to keep the write side free of `@/lib/auth`) shipped. Paired
`RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED`/`RELATIONSHIP_CHANGED` from
`addKinesisLinkAction`/`updateKinesisLinkAction`/`removeKinesisLinkAction`
and the to-do linking call site in `lib/data/todos.ts`, per "Kinesis Links:
what a link event actually records" above (paired per-endpoint rows, raw
type + `inverse`, resolved at render time); `ITEM_DELETED` wherever an
object with live relationships is deleted, per "Deletion" above (paired
rows onto survivors, written before the delete commits); and, per "Phase 1
remainder" above, `FIELD_CHANGED`/`STATUS_CHANGED`/`ITEM_CREATED`/
`ITEM_ARCHIVED`/`ITEM_RESTORED`/`GOAL_COMPLETED`/`GOAL_MILESTONE_COMPLETED`/
`TODO_COMPLETED`/`TODO_REOPENED` wired into every module's own mutations
(Documents, Goals, To-Dos, Custom Items, Finance Items), via the shared
`diffObjectFields` helper wherever a delete-and-recreate custom-fields save
already existed. Every paired write and its underlying mutation goes in one
transaction (Behaviour/constraints). Shipped the one visible consumer the
phase called for: a generic "History" section on object detail pages,
starting with Documents, Goals and Custom Items (Documents already had a
bespoke one, replaced) — a Kinesis Link add/remove/retype, and now every
other event type above, is visible in this section on both linked objects'
pages where relevant, not only the one where the action happened. No
significance scoring yet — newest first, unfiltered (Phase 4).

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

* **Where an Object mutation and its Object Event(s) represent one logical
  user action, write them atomically in the same transaction — this is the
  default, not an aspiration.** The original "log and swallow" rule made
  sense for `ActivityEvent`'s decorative dashboard feed, but this ticket
  explicitly elevates `ObjectEvent` to a durable source of truth several
  future features build on, and a swallowed failure there is silent data
  loss, not a cosmetic miss. It's a real risk specifically for the paired
  Kinesis Link rows above: if A's `RELATIONSHIP_ADDED` commits and B's
  silently fails, A's history shows a link B's history never learned about
  — exactly the kind of drift the rest of this design goes out of its way to
  avoid. Wrapping the `ObjectRelationship` write and its paired event
  write(s) in one `prisma.$transaction` (already this repo's pattern
  elsewhere) removes the failure mode rather than logging it after the
  fact. An explicit, narrow exception — event recording genuinely optional,
  swallow-and-log — is fine for a specific, called-out low-stakes case; it
  is not the default posture for every call site.
* Deleting an object cascades its own events (`onDelete: Cascade` on
  `objectId`) — this is fine precisely because `ITEM_DELETED` is never
  recorded on the object being deleted (see "Deletion" above); nothing of
  value is lost in the cascade. An event where that object was only the
  *related* side (X depends on Y, Y gets deleted) survives on X, falling
  back to the snapshotted `relatedObjectName` once `relatedObjectId` goes
  null — the same mechanism `ITEM_DELETED` itself now relies on.
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
  `RELATIONSHIP_ADDED`/`REMOVED`/`CHANGED` re-derive at render time from the
  stored `oldRelationshipType`/`newRelationshipType`/`inverse`, and KD-050's
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
