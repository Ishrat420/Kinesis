# KD-049 — Typed, Bidirectional Kinesis Link Connections

**Status:** Accepted — Needs Planning
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI

## Problem

Kinesis has two linking mechanisms today, and they aren't equals:

1. **`ObjectRelationship`** — a single canonical row (`sourceObjectId`,
   `targetObjectId`, `type`), unique per object pair
   (`@@unique([userId, pairKey])`, `pairKey` = the two ids sorted, so at most
   one relationship can ever exist between two given objects). The inverse
   label is *derived*, never stored twice. This already powers two things:
   * **Goal ↔ Goal** ("Linked Goals"): a real, typed, direction-aware
     relationship with 5 canonical types
     (`lib/goals/relationships.ts`) — `SUPPORTS`/`BLOCKS`/`DEPENDS_ON`/
     `RELATES_TO`/`ALONGSIDE`, each with a forward/inverse label pair.
   * **To-Do → anything**: every "linked object" chip on a to-do is *also*
     an `ObjectRelationship` row, but always written with a fixed type
     (`RELATES_TO`, aliased `CONCERNS` in `lib/data/todos.ts`) and never
     shown with a label at all — just a bare chip.
2. **`ObjectField` (type `KINESIS_LINK`) + `FieldLink`** — a user creates a
   custom field, types their own free-text label ("Related goal", "See
   also", anything), and points it at one or more targets (KD-034,
   multi-value). This is what Documents, Custom Items and Goals use today
   under "Add field". It has no direction, no derived inverse, and — a grep
   across the whole codebase turns up nothing — **no backlink UI exists for
   it anywhere**, despite KD-023 explicitly asking for one. A Document
   pointing at a Goal never shows up on that Goal's page at all.

KD-023 (Universal Object Connections) already named this exact split and
called for a fix: *"Existing `KINESIS_LINK` custom fields should eventually
use the same universal relationship layer rather than maintaining separate
semantics."* That never happened. This ticket is that work — generalizing
the pattern that already works for Goals into something every object type
gets, plus the "custom text" escape hatch and card treatment this ask adds
on top.

## Goal

Generalize the Goal↔Goal relationship pattern — proven, already shipped —
into a universal **Connections** capability, available from every linkable
object type (Document, Goal, Custom Item, Finance Item, Person — KD-023's
own list):

* A canonical set of relationship types, each with a real forward/inverse
  label pair, plus one open-ended custom-text type for anything that
  doesn't fit yet.
* One relationship stored once. The inverse is always derived from the
  same row — never a second, independently-editable record that can drift
  out of sync. (This is already how Goals work today; the requirement is
  to keep it true everywhere this generalizes to, not to invent it.)
* The chosen type reads as if it *were* the connected card's own field
  name, wherever that card appears.
* Clean, closed storage now, so future "mechanics" (the ask is explicit
  that behaviour comes later) attach to a real, stable `type` value without
  another migration.

**No behaviour beyond display in this ticket.** Architecture and storage
only, per the ask — no code yet either.

## Architecture

### 1. Extend the type vocabulary

```prisma
enum ObjectRelationshipType {
  SUPPORTS
  BLOCKS
  DEPENDS_ON
  RELATES_TO
  ALONGSIDE
  CUSTOM   // new
}

model ObjectRelationship {
  // ...unchanged...
  customLabel String?   // new -- set only when type = CUSTOM
}
```

`customLabel` is shown on **both** sides for now, unchanged — matching the
ask's own "for now it would not matter" about the custom option's inverse.
A genuinely separate forward/inverse custom pair is a clean, additive
fast-follow (one more nullable column) if it turns out to matter later; not
required to ship this.

### 2. The label pairs — one wording, not two

`lib/goals/relationships.ts` already ships this table today:

| Type | Forward | Inverse (shipped today) |
|---|---|---|
| `SUPPORTS` | Supports | Supported by |
| `BLOCKS` | Blocks | Blocked by |
| `DEPENDS_ON` | Depends on | Required for |
| `RELATES_TO` | Related to | Related to |
| `ALONGSIDE` | Alongside | Alongside |

The wording just given for this ticket differs slightly: **"Being
Supported by"** and **"Being Blocked By"**, and "Depends" rather than
"Depends on". Once this generalizes past Goals, there must be exactly *one*
labels table, not two copies that can quietly drift apart. **Decide the
wording once** (either keep today's shorter Goals wording, or adopt the
new phrasing and update Goals to match) before Phase 1 ships, and move the
table out of `lib/goals/relationships.ts` into a home that isn't
goal-specific (e.g. `lib/objects/relationship-labels.ts`).

### 3. The picker: choose a relationship, not a field label

Today, adding a Kinesis Link field means: set a field's type to Kinesis
Link, type an arbitrary label, then pick targets. That label has nothing
to do with direction — it's just text.

New flow, modeled directly on `LinkedGoals.tsx`'s existing add form: pick a
target, then pick from an **8-item list** — both named directions of each
asymmetric pair spelled out as separate, directly-selectable options
(*Supports*, *Being Supported by*, *Blocks*, *Being Blocked By*, *Depends*,
*Required for*, *Related to*, *Alongside*) — plus a **Custom…** option that
reveals a free-text input. This differs slightly from how Goals work today
(which only ever offers the 5 *forward* labels when creating, since you're
always describing the relationship from the goal you're on): offering both
directions up front lets someone say "this is Required for that" directly,
without translating it into "that Depends on this" first.

Picking an inverse-facing option (e.g. "Required for") stores the *current*
object as `targetObjectId` and the other one as `sourceObjectId`, same
`type` — the derivation that already makes Goals' own inverse side correct
today, just entered from either direction instead of only one.

### 4. The card shows the connection, not an external field label

`KinesisLinkCard` today renders only the target's own module, name, and
KD-042 preview stats — never the relationship itself. The label lives
*outside* the card, as a custom field's own `<label>`. New requirement:
render the resolved label — `relationshipLabel(type, inverse)`, or the
custom text — **on the card itself**, as a small eyebrow, so a card reads
correctly wherever it's reused (a flat Connections list has no per-field
header to borrow one from).

### 5. Where this shows up

A generalized `Connections` component — `LinkedGoals.tsx` with "Goal"
genericized out — on every linkable object's detail page: Documents,
Goals (replacing today's Linked Goals panel), Custom Items, Finance Items,
People. Same outgoing-and-incoming shape ("Connections" / "Referenced by")
KD-023 asked for from the start and never got, for anything but Goals.

## Explicit non-goals for this ticket

* **No mechanics behind any type yet** — a `DEPENDS_ON` connection doesn't
  block, gate, or notify anything. Display only, exactly as asked.
* **No decision yet to retire the `KINESIS_LINK` custom field type.** It
  can keep existing untouched, alongside the new Connections panel, while
  this ships — the same "don't force a destructive migration" principle
  KD-023 already commits to. Migrating existing field-based links onto
  Connections and retiring the custom field type is the natural next step,
  but it touches every module's "Add field" UI and real saved data, and
  deserves its own ticket once Connections has shipped and proven itself.

## Behaviour / open questions

* `pairKey` is already sorted-pair-only, not type-aware — at most one
  relationship of *any* kind can exist between two given objects,
  system-wide. That already delivers "one canonical relationship, not two
  records" with no schema change needed.
* That becomes visible in a new way once Connections is universal: a
  To-Do's own incidental link to an object is a bare `RELATES_TO` edge on
  the *same* pair a deliberate typed connection between those two objects
  would want. Today, adding a second relationship to an already-linked
  pair just errors ("already linked"). **Decide:** keep that error, or let
  adding a typed Connection to a pair that only ever held a bare
  `RELATES_TO` edge upgrade it in place. Recommend the latter — a to-do's
  incidental link silently blocking an intentional one would be
  surprising.
* To-Do's own link chips (KD-025's board) are a separate, lighter
  presentation and don't need to start showing type badges just because
  the underlying table now carries real types elsewhere — only the new
  Connections panel needs to render type.
* `RELATES_TO` stays the quiet default for anything that doesn't ask for a
  type — To-Do links keep working exactly as they do today.

## Phases

**Phase 1 — Schema & shared labels**
Add `CUSTOM` to `ObjectRelationshipType` + `customLabel` column, migration.
Settle the wording question above and move the labels table to a
non-goal-specific home.

**Phase 2 — Generalize the panel**
`LinkedGoals` → `Connections`, usable from any object id, with the 8-option
+ Custom picker and matching server actions. Ship on Documents and Custom
Items first (the two with an existing `KINESIS_LINK` field precedent to
sit alongside), then Finance Items and People.

**Phase 3 — Card treatment**
Move the relationship label onto `KinesisLinkCard` itself; drop the
external field-style label wherever Connections replaces it.

**Phase 4 — Dogfood on Goals**
Migrate Goals' own Linked Goals panel onto the generalized `Connections`
component.

**Phase 5 (separate ticket, not committed here)**
Decide the `KINESIS_LINK` custom field type's fate — coexist indefinitely,
or migrate its saved links into Connections and retire it, per KD-023's
incremental-migration guidance.

## Related

* **Executes on:** KD-023 (Universal Object Connections) — its own deferred
  "Kinesis Link fields should use the same universal relationship layer"
  item, scoped down to display-only for now.
* **Builds on:** the existing, working `ObjectRelationship` +
  `lib/goals/relationships.ts` + `LinkedGoals.tsx` (Goal↔Goal) and
  `lib/data/todos.ts` (To-Do→anything) — nothing here is a new mechanism,
  it's generalizing one that already works.
* **Feeds:** KD-048 (Object Event Model) — once built, its
  `RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED` events should carry
  `type`/`customLabel` so a Connection change reads correctly in History.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card) — `KinesisLinkCard`
  gains the type badge.
* A fuller convergence with the `KINESIS_LINK` custom field type, if
  pursued (Phase 5), should get its own ADR alongside KD-023's role —
  "what a Kinesis Link even is" becomes a real decision at that point, not
  just a work item.
