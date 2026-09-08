# KD-032 — Relationships bypass the universal object layer

**Status:** Planning Needed
**Priority:** Medium
**Tags:** Architecture, Data Model, Technical Debt, Foundation Dependent

## Summary

KD-023 and KD-024 established one way for any record in Kinesis to be linked to any other: everything worth linking is backed by an `Object`, and `ObjectRelationship` joins two of them with a type. Goals, To-Dos, Documents and Custom Items all go through it.

The Relationships module — the one part of Kinesis that is actually *about* relationships — does not. `Relationship` is not an `Object`, `RelationshipGoal` is its own join table, and neither touches `ObjectRelationship`. So "how do I link record A to record B" has three different answers depending on which two records you name.

```text
Goal ──── ObjectRelationship ──── Document     the universal layer
Person ─── Relationship ────────── Person      its own table, no Object
Relationship ── RelationshipGoal ── Goal       a third, bespoke join
```

`Person` *is* Object-backed (`Person.objectId`), and `Goal` is too — so both ends of the bespoke joins already have the thing the generic layer needs.

## What exists today

* **`ObjectRelationship`** — `SUPPORTS` / `BLOCKS` / `DEPENDS_ON` / `RELATES_TO` / `ALONGSIDE`, with a computed `pairKey` and cascade-safe deletion through `deleteObjects` (`lib/data/objects.ts`).
* **`Relationship`** — person-to-person, keyed `@@unique([userId, firstPersonId, secondPersonId])`, with its own `practices`, `reflections`, `importantDates` and `linkedGoals`. Created and deleted by hand against the table in `app/(app)/relationships/actions.ts`; the delete is a raw `tx.relationship.deleteMany`, not `deleteObjects`.
* **`RelationshipGoal`** — a composite-key join straight from `Relationship` to `Goal`.

Deleting a `Person` already goes through `deleteObjects`, like every other module. Deleting the `Relationship` between two people cannot, because it has no `objectId`. Functionally fine — the FK cascades cover it — but the "delete by identity" convention documented in `lib/data/objects.ts` silently does not apply to the module's central entity.

### The related unenforced invariant

A relationship's children hang off *either* a `Relationship` or a `Person` (for a relationship with oneself, KD-021), expressed as two nullable FKs with a convention that exactly one is set:

* `ConnectionPractice` — `relationshipId?` / `selfPersonId?`
* `RelationshipReflection` — same
* `RelationshipImportantDate` — same

The same shape recurs outside the module: `NotificationRead` carries five mutually-exclusive nullable FKs, `AttentionDismissal` three, both "for referential integrity alone".

**No CHECK constraint enforces any of it.** It is an application-level convention, restated in the schema comments and re-implemented by hand in `ownerOf` / `groupByOwner` / `reconcileChildren`. Five instances, five chances to drift.

## Why this is not just tidiness

The universal object layer's value is that a capability written once applies everywhere. Every capability added to `ObjectRelationship` from here — link types, traversal, a relationship graph, "what does this support?" — arrives for Goals, Documents, To-Dos and Custom Items and stops at the Relationships module boundary. The module most likely to want a typed link between two records is the one that cannot use them.

## Options

### 1. Bring `Relationship` onto the object layer

Give `Relationship` an `objectId`, express person-to-person links as `ObjectRelationship` rows, and retire `RelationshipGoal` in favour of a goal-to-relationship `ObjectRelationship`.

The right long-term shape, and the largest piece of work in the v1.2.0 consistency set: schema migration, backfill for existing rows, every read and write path in the module, plus the delete path moving to `deleteObjects`. The `@@unique([userId, firstPersonId, secondPersonId])` guarantee has to survive the move — `pairKey` is the existing mechanism for exactly that, and needs checking against the two-people case before anything is migrated.

### 2. Retire only `RelationshipGoal`

The narrower half. `Goal` is Object-backed; if `Relationship` becomes one, its link to a goal is an ordinary `ObjectRelationship`. Not separable from option 1 in practice — it needs `Relationship` to have an `objectId` first — but worth naming, because it is the part with a visible payoff: goal-linked relationships (KD-022) would surface through the same traversal as every other goal link.

### 3. Record the exemption and move on

Say in `docs/decisions` that the Relationships module models its own domain and is deliberately outside the universal layer, and drop the expectation. Cheap and honest if the module is not going to grow more link types. It does mean KD-023's "any object to any object" claim is qualified from here on, and the qualification belongs in ADR-006 and KD-024 rather than being folk knowledge.

### 4. Add the missing CHECK constraints regardless

Independent of 1–3, and worth doing on its own: enforce "exactly one parent" in the database for the three relationship child tables, and "at most one" for `NotificationRead` and `AttentionDismissal`. Small, mechanical, no API change, and it closes a class of silent corruption that currently only application code prevents.

## Proposed shape

Option 4 first — it is cheap, independent, and useful whichever way the rest goes.

Then a decision between 1 and 3 *before* v1.2.0 work is scheduled, because option 1 is large enough to consume the release on its own and option 3 costs nothing. What must not happen is the current state: the exemption existing without anyone having chosen it.

## Open questions

* Does `pairKey` express an unordered person pair correctly, or does `Relationship`'s ordered `firstPerson` / `secondPerson` carry meaning that would be lost?
* Do the child tables (`practices`, `reflections`, `importantDates`) stay hung off `Relationship` under option 1, or do they hang off its `Object` too?
* Is a person-to-person link ever going to want the `ObjectRelationshipType` vocabulary (`SUPPORTS`, `BLOCKS`, …), or is its own free-text `type` the right model for a domain the enum was not designed for? If the enum does not fit, that is an argument for option 3.

## Related

* KD-023 — universal object connection.
* KD-024 — universal object capability layer (Done); this is the gap left in it.
* KD-021 — relationship with oneself; the reason the children carry two nullable parents.
* KD-022 — goal-linked relationships; the feature `RelationshipGoal` exists for.
* ADR-006 — Relationship module.
