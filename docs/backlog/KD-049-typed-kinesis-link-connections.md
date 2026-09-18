# KD-049 — Typed Kinesis Links

**Status:** Accepted — Needs Planning
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI

**Revision note:** rewritten after review. Three architectural corrections
from that review are folded in below: uniqueness is type-aware, not
pair-aware; Kinesis Link Custom Fields and typed Kinesis Links are treated
as related but distinct, not a foregone merge; and the Kinesis Link label
is a presentation-layer decoration, not something `KinesisLinkCard` owns
intrinsically. Terminology below follows the product vocabulary given in
review (see **Vocabulary**).

## Vocabulary

| Term | Means |
|---|---|
| **Kinesis Link** | The link between two Objects — one `ObjectRelationship` row. |
| **Kinesis Link label** | The resolved text for a Kinesis Link's meaning from the current Object's side — *Depends on*, *Blocks*, *Supports*, *Related to*, etc. |
| **Kinesis Link card** | The linked Object's own preview (today's `KinesisLinkCard` — module, name, KD-042 stats). |
| **Kinesis Links** | The section/list of Kinesis Links shown on an Object's page. |
| **Kinesis Link Custom/Typed label** | A user-typed free-text label instead of a canonical one — deferred, see below. |
| **Kinesis Link Custom Field** | The existing, separate `ObjectField` (type `KINESIS_LINK`) + `FieldLink` mechanism — "Add field" on Documents/Custom Items/Goals today. Related to Kinesis Links, not assumed equivalent (see Architecture §2). |

## Problem

Kinesis has two linking mechanisms today, and they aren't equals:

1. **`ObjectRelationship`** — a single canonical row (`sourceObjectId`,
   `targetObjectId`, `type`), unique per object pair today
   (`@@unique([userId, pairKey])`, `pairKey` = the two ids sorted — see
   Architecture §1 for why this is being loosened, not kept). The label is
   *derived* from the one row, never stored twice. This already powers two
   things:
   * **Goal ↔ Goal** ("Linked Goals"): a real, typed, direction-aware
     Kinesis Link with 5 canonical types (`lib/goals/relationships.ts`) —
     `SUPPORTS`/`BLOCKS`/`DEPENDS_ON`/`RELATES_TO`/`ALONGSIDE`, each with a
     forward/inverse label pair.
   * **To-Do → anything**: every "linked object" chip on a to-do is *also*
     an `ObjectRelationship` row, but always written with a fixed type
     (`RELATES_TO`, aliased `CONCERNS` in `lib/data/todos.ts`) and never
     shown with a label at all — just a bare chip.
2. **Kinesis Link Custom Fields** (`ObjectField` type `KINESIS_LINK` +
   `FieldLink`) — a user creates a custom field, types their own free-text
   label ("Emergency contact", "Insurance provider", "Primary vehicle",
   anything), and points it at one or more targets (KD-034, multi-value).
   This is what Documents, Custom Items and Goals use today under "Add
   field". It has no direction, no derived inverse, and — a grep across
   the whole codebase turns up nothing — **no backlink UI exists for it
   anywhere**, despite KD-023 asking for one. A Document pointing at a
   Goal never shows up on that Goal's page at all.

KD-023 (Universal Object Connections) named this split and asked for a
fix. This ticket generalizes what already works for Goals into a real
**Kinesis Links** section on every Object type — without assuming that
means Kinesis Link Custom Fields disappear (see §2).

## Goal

Generalize the Goal↔Goal Kinesis Link pattern — proven, already shipped —
into a Kinesis Links section available from every linkable Object type
(Document, Goal, Custom Item, Finance Item, Person — KD-023's own list):

* A canonical set of relationship types, each with a real forward/inverse
  label, unchanged from what Goals already ship.
* **One row per relationship, per pair, per type** — the inverse is always
  derived from that one row, never a second, independently-editable
  record that can drift. That is the actual meaning of "one canonical
  relationship": one row *represents* a relationship and derives its own
  inverse. It does **not** mean two Objects may only ever have one
  relationship of any kind between them (see §1).
* One label can span **multiple** targets (`Goal A` `SUPPORTS` `Goal B`,
  `Document C`, and `Custom D` all at once) — already implicitly true of
  the schema, made explicit here because it must keep working.
* The Kinesis Link label reads correctly wherever the linked Object's card
  is shown *in the context of that Kinesis Link* — without permanently
  changing what the card itself is (see §3).
* Clean, closed storage now, so future mechanics attach to a real, stable
  `type` value later without another migration.

**No behaviour beyond display in this ticket.** Architecture and storage
only — no code yet either.

## Architecture

### 1. Uniqueness must be type-aware, not pair-aware

Today: `@@unique([userId, pairKey])`, `pairKey` = the two Object ids
sorted. That means at most **one relationship of any kind, ever** between
two given Objects — which is stricter than "one canonical relationship"
actually requires, and it is already visibly too strict:

```text
Goal A SUPPORTS Goal B
Goal A ALONGSIDE Goal B
```

...should both be valid, and later:

```text
Person A SUPPORTS Goal B
Person A RESPONSIBLE_FOR Goal B
```

It also silently collides with To-Do's own incidental use of the same
table: a to-do's bare `RELATES_TO` link to an Object already occupies the
one slot a deliberate Kinesis Link between that same pair would want.

**Fix:** scope uniqueness to `(userId, pairKey, type)` instead of
`(userId, pairKey)`. Two Objects can then hold one `SUPPORTS` Kinesis Link
*and* one `ALONGSIDE` Kinesis Link simultaneously, and a to-do's quiet
`RELATES_TO` edge no longer blocks an unrelated `DEPENDS_ON` Kinesis Link
between the same two Objects — this resolves the To-Do collision case
outright rather than needing special-case "upgrade in place" logic. A
pair can still only hold **one relationship of a given type** — `A
DEPENDS_ON B` and `B DEPENDS_ON A` remain mutually exclusive, correctly,
since `pairKey` is direction-agnostic and `type` alone doesn't distinguish
them; that's the one row whose inverse is derived, exactly as designed.

Multiple targets under one label ("`SUPPORTS`: Goal B, Document C, Custom
D") falls out of this for free — each is its own `(source, target, type)`
row; nothing new to store. The **Kinesis Links** section (§4) groups rows
that resolve to the same label together for display; grouping is a query
concern, not a schema one.

### 2. Kinesis Link Custom Fields and typed Kinesis Links are related, not equivalent

A Kinesis Link Custom Field answers *"what role does this linked Object
play as a property of this Object"* — `Emergency contact → Peach`,
`Insurance provider → AAMI`, `Renewal document → Passport 2026`, `Primary
vehicle → Corolla`. Those are meaningful, but they're property-shaped, not
graph semantics.

A typed Kinesis Link answers a different, more structural question —
`DEPENDS_ON`, `BLOCKS`, `SUPPORTS`, `ALONGSIDE` describe how two Objects
relate to *each other*, the kind of thing later mechanics (dependency
gating, blocking, notifications) would hang off.

These can share infrastructure — the same `ObjectRelationship` table, the
same derived-inverse mechanics, possibly even the same UI shell — without
being the same concept. **This ticket does not decide to retire or merge
Kinesis Link Custom Fields.** The right framing for later is: *investigate
whether they can share underlying infrastructure without necessarily
collapsing into one thing* — not a migration-and-retire plan. Both can
keep existing side by side indefinitely; whether they ever converge is a
separate, later decision with its own ADR, made once there's more real
usage of each to learn from.

### 3. The Kinesis Link label decorates the card; it doesn't belong to it

`KinesisLinkCard` represents *the target Object* — that's it, and that
should stay reusable everywhere an Object preview is needed: search
results, Recent Activity, a Kinesis Link Custom Field's list of targets.
None of those have (or want) a Kinesis Link label.

```text
Kinesis Link Custom Field:  Renewal document
Kinesis Links:              Required for
Search result:              (no label)
Recent activity:            (no label)
```

So the label is layered on top, at the call site that actually has a
Kinesis Link to describe — a small optional prop on the existing card
(`<KinesisLinkCard object={target} label="Depends on" />`), not a field
`KinesisLinkCard` always carries. Every existing caller passes nothing and
is completely unaffected; only the new Kinesis Links section passes a
label. (A separate wrapper component — `<KinesisLink label="Depends on">`
around the card — is an equally valid shape if a future need calls for
more than one line of decoration; either way, the card's own identity
stays untouched.)

### 4. One flat list — the derived label already carries perspective

Earlier drafts of this ticket proposed separate "outgoing"/"Referenced by"
sections. Unnecessary: the derived label already reads correctly from
whichever side the current Object sits on, so there is nothing left for a
second section to clarify. One list, grouped by resolved label:

```text
Depends on
[ Save $30k ]

Supported by
[ Mortgage broker ]

Blocks
[ Submit home loan application ]

Alongside
[ Improve credit score ]
```

The viewer never needs to know whether the current Object is stored as
`source` or `target` — the label already says it.

### 5. The label vocabulary (confirmed — matches what's already shipped)

| Canonical type | Forward Kinesis Link label | Inverse Kinesis Link label |
|---|---|---|
| `SUPPORTS` | Supports | Supported by |
| `BLOCKS` | Blocks | Blocked by |
| `DEPENDS_ON` | Depends on | Required for |
| `RELATES_TO` | Related to | Related to |
| `ALONGSIDE` | Alongside | Alongside |

No wording change from what `lib/goals/relationships.ts` ships today —
the earlier draft's proposed rewording ("Being Supported by" etc.) is
dropped in favour of the shorter, already-shipped wording, which reads
better as an actual label. The table itself still moves to a
non-goal-specific home (e.g. `lib/objects/relationship-labels.ts`) since
the mechanism is no longer Goal-specific; only its location changes, not
its content.

### 6. The picker: both directions, no Custom yet

Modeled on `LinkedGoals.tsx`'s existing add form, generalized: pick a
target, then pick a Kinesis Link label from an **8-item list** — both
directions of each asymmetric pair spelled out as their own option
(*Supports*, *Supported by*, *Blocks*, *Blocked by*, *Depends on*,
*Required for*, *Related to*, *Alongside*). Picking an inverse-facing
option (e.g. "Supported by") simply flips `source`/`target` and stores the
canonical type (`SUPPORTS`) — the same derivation that already makes
Goals' inverse side correct today, just directly selectable from either
direction instead of only the forward one.

**No Custom/Typed label option yet.** It's a natural, additive extension
later (one more enum value + a nullable text column, same shape the
earlier draft sketched), but there's no real use case for it today —
don't build it until one shows up.

## Explicit non-goals for this ticket

* **No mechanics behind any type** — a `DEPENDS_ON` Kinesis Link doesn't
  block, gate, or notify anything. Display only.
* **No Kinesis Link Custom/Typed label (free text) yet** — ship the 5
  canonical types first; add free text when a real need appears.
* **No decision to retire or merge Kinesis Link Custom Fields** — they
  stay exactly as they are. Whether they ever share more infrastructure
  with Kinesis Links is a later, separate investigation (§2), not a
  planned migration.

## Phases

**Phase 1 — Schema**
Change `ObjectRelationship`'s uniqueness to `(userId, pairKey, type)`.
Relocate the (unchanged) label table out of `lib/goals/relationships.ts`
into a shared, non-goal-specific home.

**Phase 2 — Generalize the section**
`LinkedGoals` → a shared **Kinesis Links** section, usable from any Object
id: one flat list grouped by resolved label, the 8-direction picker (no
Custom), matching server actions generalized off their goal-specific
originals. Ship on Documents and Custom Items first (the two with an
existing Kinesis Link Custom Field precedent to sit alongside), then
Finance Items and People.

**Phase 3 — Card decoration**
Add the optional label prop (or wrapper) from §3 to `KinesisLinkCard`;
used only by the new Kinesis Links section.

**Phase 4 — Dogfood on Goals**
Migrate Goals' own Linked Goals panel onto the generalized Kinesis Links
section, retiring the goal-specific component and actions in favour of
the shared ones.

**Deferred, not scheduled**
* Kinesis Link Custom/Typed label (free text) — add when needed (§6).
* Investigate whether Kinesis Link Custom Fields and Kinesis Links can
  share infrastructure — research, not a migration plan (§2).

## Related

* **Executes on:** KD-023 (Universal Object Connections) — its own
  deferred backlink/typing item, scoped down to display-only for now, and
  deliberately not resolving KD-023's "should `KINESIS_LINK` fields use
  the same layer" question in favour of the Custom Field either.
* **Builds on:** the existing, working `ObjectRelationship` +
  `lib/goals/relationships.ts` + `LinkedGoals.tsx` (Goal↔Goal) and
  `lib/data/todos.ts` (To-Do→anything) — nothing here is a new mechanism,
  it's generalizing one that already works, with its uniqueness rule
  loosened to match what it's actually being asked to represent.
* **Feeds:** KD-048 (Object Event Model) — once built, its
  `RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED` events should carry `type`
  so a Kinesis Link change reads correctly in History.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card) — `KinesisLinkCard`
  gains the optional label decoration.
* Any future convergence with Kinesis Link Custom Fields should get its
  own ADR — "what a Kinesis Link even is" is a decision, not a work item,
  once it's actually on the table.
