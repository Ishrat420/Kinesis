# KD-034 — Multi-Value Kinesis Link Fields

**Status:** Accepted 
**Priority:** Medium
**Tags:** UX / UI, Data Model, Architecture

## Summary

A Kinesis Link field should hold **one or many** linked Objects, of **any allowed
type**, under a **name the person chooses**.

```text
Linked Goal  → Goal X
Linked Goal  → Goal Y            still valid — two fields, if that is how they think

Linked Goals → Goal X, Goal Y    now also valid — one field, two links

Supported by → Goal X, CustomObject Z
Blocked by   → Document Z
```

The person organises their own records and choose/types out the field name. Kinesis stops forcing one link per
field and lets the naming carry the meaning.

## Scope

**In:** every Kinesis Link field — Documents, Custom Items, To-Dos, and Goals
once KD-033 gives them fields. No link field is left on the old one-per-field
behaviour.

**Out:** **goal-to-goal linking stays exactly as it is.** "Linked Goals" on a
goal is a bespoke, typed, symmetric relationship with its own vocabulary
(`SUPPORTS`, `BLOCKS`, …), its own inverse labelling, and its own UI. It is a
different feature that happens to share a word, and it is deliberately untouched
by this ticket.

## What exists today

There is no single "Kinesis Link" implementation. There are three, and only one
of them is genuinely single-valued.

| Surface | Stored as | Multi today | Label | Allowed targets |
| --- | --- | --- | --- | --- |
| Document, Custom Item field | `targetObjectId` on the record's own field row | **No** | typed by the person | Document, Custom Item, Goal |
| To-Do "link to" | `ObjectRelationship`, fixed type `RELATES_TO` | **Yes** | none — meaning is fixed | any Object the owner has |
| Goal "Linked Goals" | `ObjectRelationship`, type chosen per link | Yes | fixed enum, inverted at the far end | Goals only — **out of scope** |

Details that shape the work:

* **Field links** live on `DocumentField` / `CustomItemField` — two structurally
  identical tables, each with its own decoder and its own `Object` back-relation.
  `value` is unused for a link; the id sits in `targetObjectId`, nullable, with
  `onDelete: SetNull`. `validateKinesisTargets` (`lib/data/kinesis-links.ts`)
  **already takes an array**, so ownership checking needs no redesign.
* **To-Do links** are a whole-set replace in `lib/data/todos.ts`: delete every
  relationship from the To-Do's object, then `createMany` the submitted
  `linkObjectIds`. Ownership is one `count`, with **no type restriction at all**.
* **Goals cannot host a link field** — there is no goal field table. KD-033
  introduces one, and it should land on whatever this ticket decides.
* **Duplicate field labels are already legal** — nothing checks for uniqueness —
  and must stay legal, since two fields both called "Linked Goal" is a shape this
  ticket explicitly preserves.

## What this actually leaves to do

* **Documents and Custom Items** are the only truly single-valued case. This is
  the real storage change.
* **To-Dos** already hold many links. The work there is parity — same picker,
  same tokens, same target rules — plus the naming question below.
* **Goals** arrive as a link host with KD-033.
* **To-Do links become named fields** We will have to do this sp that To-Dos get the shared picker, tokens and target
  rules, but one implicit "Links" group rather than named fields. Least work,
  keeps `ObjectRelationship` justified, leaves To-Dos the one surface where a
  link cannot be named.


## Decided: no cardinality setting

Every link field accepts one or many. There is no Single / Multiple
configuration, and none is planned.

This is the right answer on its own terms, the person organises by naming
fields, so a "Renewal Document" field that happens to hold one link is
indistinguishable from a field that forbids a second, and forbidding it buys
nothing. It is also the only answer the current model supports: **there is no
field definition anywhere in Kinesis.** Label and type live on each record's own
row, so a per-field setting would be configured per record instance, and the same
field name could disagree with itself across two records.

If field definitions ever arrive with Object Types (KD-035), cardinality can be
reconsidered there. Nothing here forecloses it.

## Decided: one field, mixed types

`Supported by → Goal X, CustomObject Z` puts two different kinds of object in one
field, and that is a requirement rather than a later refinement.

It follows that **per-field type restriction is out of scope** — a field cannot
be told "Documents only", because a field has no definition to hold such a rule.
The picker offers every allowed target type; the person decides what belongs.

**Field labels carry no semantics.** "Supported by" and "Blocked by" are strings
the person typed. They are not the `ObjectRelationshipType` enum, they have no
inverse, they do not appear on the target, and nothing should ever try to map
them onto relationship types. The resemblance is the person's vocabulary, not the
system's.

## The fact that decides storage

**A named field has to exist while it is empty.** Someone creates "Supported by"
and adds nothing yet; today a field whose target is deleted stays visible with an
empty slot (`onDelete: SetNull`).

An `ObjectRelationship` row only exists while its link does — there is nowhere
for "a field called Supported by, currently pointing at nothing" to live. So a
named link needs a row of its own regardless of where its targets go. To-Do links
carry no name, which is exactly why `ObjectRelationship` has always suited them.

## Storage

### 1. Field row plus a child link table — recommended

The field row keeps `label`, `type` and `position`. A child table
(`fieldId`, `targetObjectId`, `position`) holds the targets;
`targetObjectId` retires from the field row once migrated.

Keeps the FK to `Object`, so a link still cannot point at something that does not
exist or is not yours. Mixed types need nothing extra — the child rows simply
point at different kinds of object. Must be built against a **unified** field
store, or it is two child tables now and three after KD-033.

## One experience everywhere

* **One picker.** `KinesisLinkField` backs field links today; To-Do linking
  should use the same control rather than its own.
* **One display.** Tokens with an ✕ and an **Add** action:

  ```text
  Supported by

  [ Goal X × ] [ CustomObject Z × ]  + Add
  ```

  `KinesisLinkCard` and `EditDocumentForm`'s separate rendering of link fields
  both assume one card per field and need the same treatment.
* **One validation path.** `validateKinesisTargets` and the inline `count` in
  `lib/data/todos.ts` are the same check written twice.

## Target rules have to converge

* Field links: Document, Custom Item, Goal (`KINESIS_LINK_TARGET_CONFIG`)
* To-Do links: **anything the owner has**, Finance and Person included

Someone who can link a To-Do to a savings account but cannot link a document
field to one will read that as a bug. `KINESIS_LINK_TARGET_CONFIG` separates
`enabled` from `order` precisely so widening is safe — and KD-033's own example
(a goal linked to a savings account) needs Finance enabled regardless.

## Wire format — a hard prerequisite

Custom fields post as five parallel `FormData` arrays (`fieldId`, `fieldLabel`,
`fieldType`, `fieldValue`, `fieldTarget`) rejoined **by index**;
`CustomFieldsEditor` emits empty hidden inputs purely to keep those indices
aligned. One field carrying N targets breaks that outright.

The encoding must be replaced — a JSON payload per field, or explicitly indexed
names. To-Dos already post `linkObjectId` as a repeated value, which is a small
argument for following their shape.

## Deletion

Field links are `SetNull` today: the field survives with an empty slot. A token
list has no equivalent, so child rows should cascade and the token disappear.

**This is a visible behaviour change.** Today a deleted target leaves an obvious
empty field; under tokens it leaves silence. If that is not acceptable, the
alternative is a dismissible "no longer available" token.

## Ordering

`position` orders fields within a record; a field's own targets need ordering
too, since their arrangement is part of how the person organised them. Insertion
order stored on the child row is enough — but decide explicitly whether tokens
are reorderable rather than letting it fall out of the query.

## Migration

* Every existing single-value link field becomes a field with one token. Two
  fields sharing a label stay two fields — nothing is merged automatically, since
  the person may have meant them separately.
* To-Do links keep their rows if they stay on `ObjectRelationship`; if they move
  to the field model, each `RELATES_TO` row sourced from a To-Do becomes a child
  row under one synthetic field.
* Goal-to-goal links are untouched.

## Dependencies

1. **Unify `DocumentField` and `CustomItemField` into one object-scoped field
   store.** Both hosts are already `Object`-backed. Without it the child table,
   the wire format and the editor are built twice now and three times after
   KD-033.
2. **Replace the positional FormData encoding.**

Neither is optional in practice, and both make KD-033 and KD-035 smaller.

## Out of scope

* **Goal-to-goal linking** — stays bespoke, untouched
* Arbitrary relationship semantics, and any mapping of field names onto
  `ObjectRelationshipType`
* Automatic relationship inference
* Per-field type restriction, and cardinality as a setting — both need field
  definitions, which do not exist
* Broader custom-field redesign, **except** the field-store unification above

## Principle

> A field's name defines the meaning of the relationship; the field may contain
> one or many linked Objects, of any allowed type.

## Related

* KD-033 — goal supporting information; needs the same field store, and needs
  Finance enabled as a target
* KD-035 — Object Types; where field definitions would live if cardinality or
  per-field type restriction are ever wanted
* KD-032 — relationships bypassing the object layer; the same "which link
  mechanism" question one level down
* KD-002 — the original Kinesis internal link field
* ADR-009 — universal quick capture, which put To-Do links on `ObjectRelationship`