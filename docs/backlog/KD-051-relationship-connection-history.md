# KD-051 — History for a Connection's Own Facts (Dates, Goals, Practices, Reflections)

**Status:** Planning Needed
**Priority:** Medium
**Tags:** Architecture, Data Model, Security, UX / UI

## Summary

The Relationships map's new History card (KD-048) can show a Person's real
change log, but a **Relationship's** (the connection between two people)
own card is honest filler today: "Connected [date]" plus a line saying
edits aren't tracked. Nothing about a connection is tracked, because
`Relationship` was never brought into the universal Object layer at all —
it has no `objectId`, so there is nowhere for an `ObjectEvent` to attach.

The ask is to close that gap for four of a connection's own collections,
at two different levels of detail:

**Standard detail** (what changed, spelled out, the way every other
History line already reads):
* Important date — Added / Removed
* Linked Goals — Added / Removed
* Connection Practices — Added / Updated

**Journal-tier — event and date only, deliberately no content**:
* Reflections — Added / Updated

The reflections split is deliberate and should stay a hard rule, not a
default: a reflection is personal, often unflattering-in-the-moment text
("frustrated again about the same argument"), and Kinesis has no reason to
duplicate that content anywhere a history feed might surface it. The
event says *that* something was written, never *what*.

## Why this needs its own ticket rather than folding into KD-048

KD-048 built the mechanism (`ObjectEvent`, `describeObjectEvent`,
`recordEvent`/`recordFieldChanges`, the diff helpers) and applied it to
every object type that already had an `objectId` — Documents, Goals,
To-Dos, Finance Items, Custom Items, and (added this session) Person.
`Relationship` was the one type deliberately left out, because giving it
one is a real, separate schema decision, not a follow-on data migration
the existing mechanism already supports.

## What exists today (confirmed by reading the schema and the save path)

* **`Relationship` has no `objectId` at all.** It isn't part of the
  `Object` layer KD-023/024 built. Nothing about a connection is
  recorded anywhere today — not these four collections, not even a plain
  `type`/`notes` edit, which `saveRelationshipMap` already diffs
  in-memory (`existing.type !== relationship.type`) but never turns into
  an event.
* **Practices, Reflections, and Important Dates already have a dual
  parent in the schema** — `ConnectionPractice`, `RelationshipReflection`,
  and `RelationshipImportantDate` each carry both an optional
  `relationshipId` and an optional `selfPersonId`. In principle a
  self-person-owned row could get history for free today (`Person`
  already has an `objectId`) — but the current map UI never actually
  creates one that way: `PersonInspector` (a non-self person's own tab)
  and the self-relationship view only expose Important Dates and Notes,
  never Practices or Reflections. So in practice, all four collections
  in this ticket are relationship-owned only, and all four are blocked on
  the same prerequisite below. Worth re-confirming during planning rather
  than assuming this session's reading is exhaustive.
* **Linked Goals (`RelationshipGoal`) is its own bespoke join table** —
  `relationshipId` + `goalId`, nothing else. It is **not** a Kinesis Link:
  it doesn't go through `ObjectRelationship`, has no `ObjectRelationshipType`,
  no forward/inverse label, none of KD-049/050's machinery. This matters
  for the design below — reusing `RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED`
  (KD-048 Phase 1's Kinesis Link events) for "goal linked to a connection"
  would be a semantic mismatch, not a shortcut.

## The prerequisite: give `Relationship` a real `objectId`

Every one of the four collections is owned by a `Relationship` row, so
recording any event about them needs *something* with an `objectId` to
write onto, and no existing object fills that role. This means:

* A schema migration adding `Relationship.objectId` (unique, FK to
  `Object`), the same shape `Person`/`Goal`/`FinanceItem`/etc. already have.
* A new `KinesisObjectType` enum value (e.g. `RELATIONSHIP`) and an
  `objectFor.relationship(...)` factory alongside `objectFor.person`,
  `objectFor.goal`, etc. (`lib/data/objects.ts`).
* `lib/objects/locations.ts`'s `locateObject`/`objectLocationSelect` needs
  a `Relationship` case, the same generic name/type/module/href resolver
  every other type already has — needed for `getRecentActivity` (the
  dashboard's account-wide feed) to render a connection's own events
  sensibly rather than skipping them.
* The database trigger that refuses a mismatched `Object.type` attachment
  (added `20260903000000`, referenced in `lib/data/objects.ts`'s
  `objectFor` comment) needs to recognize the new type.
* `saveRelationshipMap`'s relationship-processing loop creates the
  `Object` row alongside the `Relationship` row on first save, the same
  way the person-processing loop already does for `Person` via
  `objectFor.person(...)`.

This is a real, contained schema change — not large, but it is the actual
gating item here, not the event types themselves.

## Proposed event model: 3 generic types, not 8 named ones

Rather than a bespoke pair per collection
(`IMPORTANT_DATE_ADDED`/`REMOVED`, `LINKED_GOAL_ADDED`/`REMOVED`,
`CONNECTION_PRACTICE_ADDED`/`UPDATED`, `REFLECTION_ADDED`/`UPDATED` — 8
new `ObjectEventType` values), the recommendation is 3 shared ones:

```prisma
enum ObjectEventType {
  // ...existing values...
  COLLECTION_ITEM_ADDED
  COLLECTION_ITEM_REMOVED
  COLLECTION_ITEM_UPDATED
}
```

`fieldKey` names which collection ("importantDate" / "linkedGoal" /
"connectionPractice" / "reflection"), the same role it already plays for
a Custom Item's ad-hoc fields. `describeObjectEvent` dispatches on
`fieldKey` to decide what the title/detail should say — including
deciding, for `fieldKey: "reflection"`, to never build a detail line at
all regardless of what's stored. This matches `FIELD_CHANGED`'s own
existing precedent (a shared type, per-field rendering) rather than
inventing a new pattern, and keeps the enum from growing by one pair
every time a new collection gets tracked later.

**Per-collection field mapping:**

* **Important date** — `fieldLabel` = the date's label (e.g. "Birthday"),
  `newValue`/`oldValue` = the formatted date. Added: title "Important
  date added", detail "Birthday · 12 May". Removed: same shape, past tense.
* **Linked goal** — reuses `relatedObjectId`/`relatedObjectName` (the
  mechanism Kinesis Links and `ITEM_DELETED` already use for "the other
  object"), **not** `fieldLabel`/value — it's fundamentally a link to a
  real Object, so it should read as one, and it survives the goal being
  deleted later the same way every other `relatedObjectName` snapshot does.
* **Connection practice** — `fieldLabel` = title, value = cadence. Added:
  "Connection practice added", detail "Weekly call · Weekly". **Open
  question below** on what "Updated" shows.
* **Reflection** — no `fieldLabel`, no `oldValue`/`newValue`, ever. Title
  only ("Reflection added" / "Reflection updated"), detail always `null`.
  Nothing about the text is stored on the event row at all — not a
  truncated snippet, not a length, nothing — so there is no accidental
  leakage path to design around later.

## Open questions

* **Connection Practice "Updated" — full diff or a single line?** A
  practice has three editable facts (title, cadence, anchor date).
  "Standard detail" could mean a real before/after diff on whichever
  field(s) actually changed (matching `FIELD_CHANGED`'s own philosophy),
  or a simpler "Practice updated" naming just the practice with no
  per-field breakdown. Dates and Linked Goals don't have this ambiguity
  (add/remove only, no "updated" state) — Practice is the one collection
  here where "updated" could mean three different things. Needs a decision
  before implementation, not a default.
* **Does Person-owned (self-facts) Important Dates get the same
  treatment?** Unlike the other three collections, `Person` already has
  an `objectId` today, so a self-person-owned Important Date could get
  `COLLECTION_ITEM_ADDED`/`REMOVED` coverage *without* waiting on the
  `Relationship.objectId` migration above — a smaller, separable first
  slice, if the map UI ever actually exercises the self-person-owned path
  for dates (see "What exists today" above; needs confirming).
* **Does this reach the self-relationship ("Relationship with myself")
  view?** KD-021's self-relationship is its own `Relationship`-shaped
  concept read differently in the UI; confirm whether its Important
  Dates/Notes should get the same audit treatment or are deliberately
  out of scope the way KD-032's review already excluded Practices/
  Reflections from a non-self person's own tab.
* **Retention/visibility for reflections specifically.** Even
  content-free, "Reflection added, 3 times this week" is itself a
  (mild) signal about someone's state. Worth a quick gut-check on
  whether that's fine (leaning yes — it's the same kind of signal a
  calendar full of 1:1s already gives) rather than assuming it without
  saying so.

## Where this plugs in

No UI work: `HistoryCard.tsx`'s `PersonHistoryCard`/`RelationshipHistoryCard`
(KD-048) already render whatever `describeObjectEvent` produces via the
existing `getPersonHistoryAction`-shaped fetch. Once `Relationship` has an
`objectId`, `RelationshipHistoryCard` swaps its static "Connected" line for
the same on-demand `getObjectEvents`-backed fetch `PersonHistoryCard`
already uses — the same file, no new component.

**Wiring point:** `saveRelationshipMap`'s existing per-collection reconcile
loops (practices, reflections, important dates, and the linked-goals diff
at the end) already compute added/removed/changed sets for the save
itself — recording events is additive at those same points, not a new
pass over the data.

## Scope estimate

Larger than the History card itself (KD-048's last piece): a real schema
migration (`Relationship.objectId`, a new `KinesisObjectType` value, the
attachment trigger, `locateObject` coverage) plus new diff/write logic in
four existing reconcile loops, plus the three open questions above
resolved before implementation starts. Not a quick follow-on.

## Related

* **Builds on:** KD-048 (Object Event Model) — the mechanism this reuses;
  its own doc already flagged Relationship's missing `objectId` as the
  next concrete step.
* **Builds on:** KD-023/024 (Universal Object Connections / Capability
  Layer) — the `Object` identity layer `Relationship` would join.
* **Related:** KD-032 (Relationships bypass the Object layer, Done) — the
  prior decision this ticket partially revisits for `Relationship` itself
  (KD-032 covered `Person`; `Relationship` was left out at the time).
* **Contrasts with:** KD-049/050 (Typed Kinesis Link Connections) — Linked
  Goals is confirmed *not* a Kinesis Link, so its event shape borrows
  `relatedObjectId`/`relatedObjectName` directly rather than any of
  KD-049/050's type/inverse/label machinery.
