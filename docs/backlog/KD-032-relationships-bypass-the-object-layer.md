# KD-032 — Relationships bypass the universal object layer

**Status:** Planning Needed
**Priority:** Medium
**Tags:** Architecture, Data Model, Technical Debt, Foundation Dependent, Security

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

### The related unenforced invariants

Two different shapes of gap, both real, and worth telling apart because they need two different fixes.

**A. Exactly one parent, on the same row.** A relationship's children hang off *either* a `Relationship` or a `Person` (for a relationship with oneself, KD-021), expressed as two nullable FKs with a convention that exactly one is set:

* `ConnectionPractice` — `relationshipId?` / `selfPersonId?`
* `RelationshipReflection` — same
* `RelationshipImportantDate` — same

The same shape recurs outside the module: `NotificationRead` carries five mutually-exclusive nullable FKs, `AttentionDismissal` three, both "for referential integrity alone".

**No CHECK constraint enforces any of it.** It is an application-level convention, restated in the schema comments and re-implemented by hand in `ownerOf` / `groupByOwner` / `reconcileChildren`. Five instances, five chances to drift. This one is checkable within the row itself — a same-row `CHECK` constraint is enough.

**B. Two referenced rows, in two other tables, agreeing on an owner.** A structurally different gap, found the same review: nothing in the schema (or a trigger) confirms both ends of a reference actually belong to the same account.

* **`Relationship`** carries its own `userId`, but `firstPersonId` and `secondPersonId` are ordinary FKs to `Person.id` — nothing ties either endpoint's `Person.userId` back to `Relationship.userId`. A row could, as far as the database is concerned, link one account's person to another's.
* **`ObjectRelationship`** has the identical shape one layer up: `sourceObjectId`/`targetObjectId` are plain FKs to `Object.id`, with nothing requiring both objects' `userId` to match `ObjectRelationship.userId`. Application code (`addGoalRelationshipAction`, `app/(app)/goals/actions.ts`) checks both ends are owned by the current user before it creates a row — real, but it is that one call site's convention, not a guarantee every future write path inherits.
* **`FieldLink`** (a Kinesis Link's target) has the same shape again: `fieldId` reaches `ObjectField.objectId` (the field's own object, whoever owns it) and `targetObjectId` names what it points at (`Object.id`) — the two can belong to different accounts, with only `validateKinesisTargets` (`lib/data/kinesis-links.ts`) standing between a link and a cross-account reference.

**B cannot be closed with a `CHECK` constraint** — confirming two referenced rows agree on an owner means looking both of them up, and Postgres `CHECK` constraints cannot see another table. This is exactly the question `20260903000000_object_integrity_invariants` and `20260904000000_object_ownership_integrity` already answered for the five Object-backed models (`Document`, `Goal`, `FinanceItem`, `Person`, `CustomItem`), with `AFTER INSERT OR UPDATE` triggers that look the referenced row up and reject a mismatch. `kinesis_assert_object_attachment` (20260904000000) is the template already proven to work; closing B for `Relationship`, `ObjectRelationship`, and `FieldLink` would extend that exact pattern rather than invent a new one.

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

### 4. Add the missing database enforcement regardless

Independent of 1–3, and worth doing on its own — two mechanisms, for the two shapes above:

* **4a. CHECK constraints for gap A.** Enforce "exactly one parent" in the database for the three relationship child tables, and "at most one" for `NotificationRead` and `AttentionDismissal`. Small, mechanical, no API change.
* **4b. Ownership-agreement triggers for gap B.** Extend the `20260904000000_object_ownership_integrity` pattern to `Relationship` (both `Person` endpoints), `ObjectRelationship` (both `Object` endpoints), and `FieldLink` (the field's object and its target). More work than 4a — it's the same shape of migration as 20260903/20260904, including the pre-migration scan that refuses to install a trigger over data that already violates it — but no new design: the function to extend already exists and is already proven in production use.

Both close a class of silent corruption that currently only application code prevents. 4b is the half that would matter most the day a second account exists — a cross-account data-integrity gap in its own right, independent of whatever gets decided between options 1–3.

## Proposed shape

Option 4 first (4a and 4b both) — cheap relative to 1–3, independent of whichever of them is chosen, and useful whichever way that decision goes.

Then a decision between 1 and 3 *before* v1.2.0 work is scheduled, because option 1 is large enough to consume the release on its own and option 3 costs nothing. What must not happen is the current state: the exemption existing without anyone having chosen it.

## Open questions

* Does `pairKey` express an unordered person pair correctly, or does `Relationship`'s ordered `firstPerson` / `secondPerson` carry meaning that would be lost?
* Do the child tables (`practices`, `reflections`, `importantDates`) stay hung off `Relationship` under option 1, or do they hang off its `Object` too?
* Is a person-to-person link ever going to want the `ObjectRelationshipType` vocabulary (`SUPPORTS`, `BLOCKS`, …), or is its own free-text `type` the right model for a domain the enum was not designed for? If the enum does not fit, that is an argument for option 3.
* Does `Relationship`'s half of gap B (4b) get built against today's `firstPersonId`/`secondPersonId` columns, or does it wait for a decision between options 1 and 3 — a person-ownership trigger written now would need rework if option 1 later moves `Relationship` onto the Object layer entirely. `ObjectRelationship`'s and `FieldLink`'s halves aren't affected either way and don't need to wait.
* `ObjectRelationship` and `FieldLink` aren't part of the Relationships module at all — they're named here only because this ticket is where gap A was already on record. Worth a call on whether 4b for those two stays here or moves to its own ticket once scoped, so this one doesn't quietly become the catch-all for every cross-table ownership gap in the schema.

## Related

* KD-023 — universal object connection.
* KD-024 — universal object capability layer (Done); this is the gap left in it.
* KD-021 — relationship with oneself; the reason the children carry two nullable parents.
* KD-022 — goal-linked relationships; the feature `RelationshipGoal` exists for.
* ADR-006 — Relationship module.
* `20260903000000_object_integrity_invariants` / `20260904000000_object_ownership_integrity` — the trigger-based pattern gap B (4b) would extend to `Relationship`, `ObjectRelationship`, and `FieldLink`.
