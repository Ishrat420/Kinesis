# KD-049 — Typed Kinesis Links

**Status:** In Progress (Phases 1–4 shipped; Finance Items/People UI still ahead)
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI

**Phase 1 status:** Shipped. `ObjectRelationship`'s uniqueness is now
`(userId, pairKey, type)`; `ObjectRelationshipType` gained `CUSTOM` and
`ObjectRelationship` gained a nullable `customLabel` column
(`20261006000000_kinesis_link_type_aware_uniqueness`). The canonical label
table moved from `lib/goals/relationships.ts` to
`lib/objects/relationship-labels.ts` (`OBJECT_RELATIONSHIP_TYPES`,
`ObjectRelationshipTypeValue`, `relationshipLabel` — same content,
non-goal-specific home and names), with `LinkedGoals.tsx`,
`app/(app)/goals/actions.ts` and `lib/data/goals.ts` updated to match.
`lib/data/goals.ts`'s `getGoalRelationships` now narrows a relationship's
`type` to the 5 canonical values before handing it to `LinkedGoals` — a
Goal↔Goal link can't be `CUSTOM` yet (nothing on this page can create one),
so this keeps that true at the type level rather than widening the
component for a case Phase 2 hasn't built a picker for.

**Phase 2 status:** Shipped, on Documents and Custom Items (Finance Items
and People still ahead). New: `lib/objects/relationship-labels.ts` gained
`kinesisLinkLabel` (resolves `CUSTOM` too, unlike the Goals-only
`relationshipLabel`), `KINESIS_LINK_DIRECTION_OPTIONS` (the 8 canonical
direction choices), `CUSTOM_KINESIS_LINK_OPTION_VALUE`, and the
`parseKinesisLinkDirectionValue`/`kinesisLinkDirectionValue` pair that
encode/decode a picker choice.
`lib/data/object-relationships.ts` (`getKinesisLinks`) reads every Kinesis
Link touching an Object from its own side, reusing `locateObject` (already
built for the Kinesis Link Custom Field mechanism) to resolve the other
end, and returns it as one flat list (§4) rather than grouped. Three new
cross-module actions in `app/actions.ts` (`addKinesisLinkAction`,
`updateKinesisLinkAction`, `removeKinesisLinkAction`) generalize
`addGoalRelationshipAction` and friends to work from any `objectId` rather
than only a Goal's. `components/kinesis-links/KinesisLinks.tsx` is the
generalized `LinkedGoals`, reusing the existing `KinesisLinkCard` for each
target; the target picker reuses `getKinesisLinkOptions` unchanged, since
it already covers every linkable type. Wired into the Documents and
Custom Item detail pages, right before/after their existing content. A
deliberate consequence of Phase 1's per-type uniqueness: the picker's
options list no longer drops an already-linked object, since a second,
differently-typed Kinesis Link to the same target is now a normal thing
to add, not a duplicate to prevent. Phase 2 initially rendered the
resolved label as a group heading over each cluster of same-label cards;
Phase 3 (below) replaced that with a label on the card itself, so Phase 2's
grouping utility (`lib/objects/kinesis-link-groups.ts`,
`groupKinesisLinksByLabel`) no longer has a caller and was removed rather
than kept unused.

**Phase 3 status:** Shipped. Explored as four placement options in a
design-canvas artifact (eyebrow line, inline-with-module pill, corner
badge, tag-under-name) before writing any code; eyebrow-as-pill was
picked. `KinesisLinkCard` gained an optional `label` prop (§3): a fixed,
neutral pill (white fill, `zinc-200` border, `zinc-700` bold sentence-case
text — never tinted to the target's module color, so it reads as "this is
the relationship" rather than another property of the target) rendered
above the icon row, `self-start` so it hugs its own text rather than
stretching to the card's width. Every existing `KinesisLinkCard` caller
still passes nothing and is unaffected; only `KinesisLinks.tsx` passes
`label={link.label}`. That component's per-label group headings (Phase 2)
are gone — one flat list, ordered as `getKinesisLinks` returns it, each
card carrying its own label.

**Phase 4 status:** Shipped. `app/(app)/goals/[goalId]/page.tsx` renders
the shared `KinesisLinks` section in place of `LinkedGoals`; `LinkedGoals.tsx`,
`getGoalRelationships`, and `addGoalRelationshipAction`/
`updateGoalRelationshipAction`/`removeGoalRelationshipAction` are deleted
rather than kept alongside their generalized replacements. A Goal's
Kinesis Links can now target any linkable Object, not only other Goals,
and the target picker stopped hiding already-linked Objects — both are
the same behavior every other Kinesis Links page already had, arriving on
Goals for the first time by using the shared mechanism instead of a
parallel one. `tests/unit/goal-relationships.test.ts` and
`tests/integration/goals/goal-relationships.test.ts` are removed with the
code they tested; the still-relevant coverage of `relationshipLabel`,
`OBJECT_RELATIONSHIP_TYPES` and `objectPairKey` moved to
`tests/unit/relationship-labels.test.ts`, and Goal↔Goal behavior through
the shared path is exercised the same way Document↔Goal already is, in
`tests/integration/kinesis-links/object-relationship-links.test.ts`.

**Revision note (2):** rewritten after review. Three architectural
corrections from that review are folded in below: uniqueness is
type-aware, not pair-aware; Kinesis Link Custom Fields and typed Kinesis
Links are treated as related but distinct, not a foregone merge; and the
Kinesis Link label is a presentation-layer decoration, not something
`KinesisLinkCard` owns intrinsically. Terminology below follows the
product vocabulary given in review (see **Vocabulary**).

A follow-up clarified a distinction the first revision missed: **ad-hoc**
custom text (typed once, on one Kinesis Link, at the moment of creating
it) is in scope for this ticket. What's still deferred is a **template**
of custom labels — a way to define a new custom label *once* and have it
persist as a reusable, named option offered again for future Kinesis
Links, effectively user-extensible DDL. That's a materially bigger
feature (storage for user-defined types, management UI, migration if one
is renamed or deleted) and stays out of scope until there's a real need
for it.

## Vocabulary

| Term | Means |
|---|---|
| **Kinesis Link** | The link between two Objects — one `ObjectRelationship` row. |
| **Kinesis Link label** | The resolved text for a Kinesis Link's meaning from the current Object's side — *Depends on*, *Blocks*, *Supports*, *Related to*, etc. |
| **Kinesis Link card** | The linked Object's own preview (today's `KinesisLinkCard` — module, name, KD-042 stats). |
| **Kinesis Links** | The section/list of Kinesis Links shown on an Object's page. |
| **Kinesis Link Custom/Typed label (ad-hoc)** | A user-typed free-text label for one Kinesis Link, entered at the moment of creating it. In scope for this ticket — see §6. |
| **Custom label template** | A saved, reusable, named custom label that would persist and reappear as a future picker option — user-extensible DDL. Out of scope, deferred until there's a real need. |
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
  label, unchanged from what Goals already ship — plus an ad-hoc custom
  label for the one-off case none of them fit (§6).
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
second section to clarify. An even earlier version of this section grouped
cards under a shared label heading; shipped Phase 3 (§3) instead puts the
label directly on each card, so the list is fully flat — no heading, no
grouping, just cards in the order they were added:

```text
[ Depends on         ]
[ Save $30k           ]

[ Supported by       ]
[ Mortgage broker     ]

[ Blocks             ]
[ Submit home loan application ]

[ Alongside          ]
[ Improve credit score ]
```

The viewer never needs to know whether the current Object is stored as
`source` or `target` — the label already says it, right on the card it
describes.

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

### 6. The picker: both directions, plus ad-hoc Custom

Modeled on `LinkedGoals.tsx`'s existing add form, generalized: pick a
target, then pick a Kinesis Link label from an **8-item list** — both
directions of each asymmetric pair spelled out as their own option
(*Supports*, *Supported by*, *Blocks*, *Blocked by*, *Depends on*,
*Required for*, *Related to*, *Alongside*) — plus a 9th, **Custom…**,
which reveals a free-text input right there. Picking an inverse-facing
canonical option (e.g. "Supported by") simply flips `source`/`target` and
stores the canonical type (`SUPPORTS`) — the same derivation that already
makes Goals' inverse side correct today, just directly selectable from
either direction instead of only the forward one.

Schema: add `CUSTOM` to `ObjectRelationshipType` and a nullable
`customLabel` column on `ObjectRelationship`, set only when `type =
CUSTOM`. The text is typed fresh each time and shown on **both** sides for
now (no separate forward/inverse custom text) — matching how ad-hoc use is
actually asked for. It is **not** saved anywhere as a reusable option: two
Kinesis Links each typed as "My weird relationship" are two unrelated
rows with the same incidental text, not one shared, named type. Offering
"save this as a reusable label" is exactly the **template** capability
called out in the revision note above, and stays out of scope.

## Explicit non-goals for this ticket

* **No mechanics behind any type** — a `DEPENDS_ON` Kinesis Link doesn't
  block, gate, or notify anything. Display only.
* **No custom label templates** — ad-hoc free text on one Kinesis Link is
  in scope (§6); a way to save that text as a new, reusable, named type
  offered again in future pickers is not. That's user-extensible DDL, a
  materially bigger feature, and isn't built until there's a real need.
* **No decision to retire or merge Kinesis Link Custom Fields** — they
  stay exactly as they are. Whether they ever share more infrastructure
  with Kinesis Links is a later, separate investigation (§2), not a
  planned migration.

## Phases

**Phase 1 — Schema**
Change `ObjectRelationship`'s uniqueness to `(userId, pairKey, type)`. Add
`CUSTOM` to `ObjectRelationshipType` + a nullable `customLabel` column.
Relocate the (unchanged) canonical label table out of
`lib/goals/relationships.ts` into a shared, non-goal-specific home.

**Phase 2 — Generalize the section**
`LinkedGoals` → a shared **Kinesis Links** section, usable from any Object
id: one flat list grouped by resolved label, the 9-option picker (8
directions + ad-hoc Custom), matching server actions generalized off their
goal-specific originals. Ship on Documents and Custom Items first (the two
with an existing Kinesis Link Custom Field precedent to sit alongside),
then Finance Items and People.

**Phase 3 — Card decoration (Shipped)**
Added the optional `label` prop from §3 to `KinesisLinkCard`, rendered as
a fixed neutral pill above the icon row; used only by the Kinesis Links
section, which dropped its Phase 2 group headings in favor of it.

**Phase 4 — Dogfood on Goals (Shipped)**
`app/(app)/goals/[goalId]/page.tsx` now renders the shared `KinesisLinks`
section instead of `LinkedGoals`, backed by `getKinesisLinks`/
`addKinesisLinkAction`/`updateKinesisLinkAction`/`removeKinesisLinkAction`
rather than `getGoalRelationships`/`addGoalRelationshipAction`/
`updateGoalRelationshipAction`/`removeGoalRelationshipAction`, all of
which are removed along with `LinkedGoals.tsx` itself. Two real behavior
changes fall out of using the shared mechanism rather than a goal-specific
one: a Goal's Kinesis Links section can now target *any* linkable Object
(Documents, Custom Items, Finance Items, People, To-Dos), not only other
Goals, exercising the "context aware Kinesis Links" idea this ticket
started from; and the target picker no longer drops an already-linked
Object from its options (matching Phase 2's other pages), since a second,
differently-typed Kinesis Link to the same target is a normal thing to
add, not a duplicate to prevent. Goal↔Goal links created before this
migration are unaffected -- they are `ObjectRelationship` rows like any
other Kinesis Link, just now read and written through the shared path.
`GoalSupportingInfo`'s Kinesis Link *Custom Field* section (§2's
distinct, `ObjectField`-based mechanism) is untouched by this migration.

**Deferred, not scheduled**
* Custom label **templates** — saving an ad-hoc custom label as a
  reusable, named type that reappears in future pickers (§6). Ad-hoc
  custom text itself ships in Phase 1–2; only the "save as a new type"
  capability is deferred.
* ~~Investigate whether Kinesis Link Custom Fields and Kinesis Links can
  share infrastructure — research, not a migration plan (§2).~~ Decided:
  see KD-050, which converges them (superseding this non-goal and §2).

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
* **Feeds:** KD-050 (Converge Kinesis Link Custom Fields into Typed Kinesis
  Links) — makes the merge call this ticket's §2 deliberately deferred, once
  real usage showed people reaching for "Add custom field → Kinesis Link"
  as their way of creating one.
* **Feeds:** KD-048 (Object Event Model) — once built, its
  `RELATIONSHIP_ADDED`/`RELATIONSHIP_REMOVED` events should carry `type`
  (and `customLabel` when set) so a Kinesis Link change reads correctly in
  History.
* **Touches:** KD-042 (Kinesis Link Rich Preview Card) — `KinesisLinkCard`
  gained the optional label decoration; its `stats` row still renders
  underneath, unaffected.
* Any future convergence with Kinesis Link Custom Fields should get its
  own ADR — "what a Kinesis Link even is" is a decision, not a work item,
  once it's actually on the table.
