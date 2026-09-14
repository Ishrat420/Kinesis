# KD-032 — Relationships bypass the universal object layer

**Status:** Accepted
**Priority:** Medium
**Tags:** Architecture, Data Model, Technical Debt, Foundation Dependent, Security

## Decision

**Option 3 — record the exemption — plus Option 4 (both halves) regardless.** `Relationship` stays outside the universal object layer. `RelationshipGoal` stays. Neither gets an `objectId`, and the person-to-person edge is never expressed as an `ObjectRelationship` row.

This reverses the direction the ticket originally leaned ("bring `Relationship` onto the object layer" as the presumed right long-term shape). What changed it was working through what the universal layer would actually be *for* here, against how the module is actually used:

* **Nothing needs to link to a relationship edge.** The scenario that would justify Option 1 — a Document or Goal attaching to "the relationship between two people" rather than to a person — doesn't occur in how this module is used. Things attach to *people* (a document about Peach attaches to Peach, not to "Mel & Peach"). Without that need, the main capability Option 1 buys — letting other modules point at a `Relationship` the way they point at a `Document` or `Goal` — has no consumer.
* **The delete behaviour the module needs already works, and doesn't depend on this decision.** Deleting a person cascades their edges (`onDelete: Cascade` on `firstPersonId`/`secondPersonId`) without touching the people on the other side of *those* people's other edges — delete Mel, and your independent bond with her son survives untouched, because it's a separate `Relationship` row. That's ordinary FK cascade behaviour on the schema as it stands today; nothing about giving `Relationship` an `objectId` would change it, and nothing about withholding one breaks it.
* **Search visibility is orthogonal, not a consequence of this decision.** `Relationship` already appears in search today (`lib/search/providers.ts`'s `relationships` provider), via its own hand-written provider — every module here has one, independent of `Object` status. Object-backing `Relationship` would not add it to search; leaving `Relationship` alone does not remove it either. If search inclusion for connections needs revisiting, that's a separate, small, unrelated change.
* **The domain doesn't want the generic vocabulary.** `ObjectRelationshipType` (`SUPPORTS` / `BLOCKS` / `DEPENDS_ON` / `RELATES_TO` / `ALONGSIDE`) was designed for capability composition between records, not for describing that two people are friends, family, or dating. Forcing the person-to-person edge through that enum would mean modeling a shape that doesn't fit, for a link the module has been explicit is meant to stay free-text and creative rather than governed by a fixed vocabulary (see Open Questions, resolved below).

Option 1 remains the technically correct move *if* a future need appears for another module to reference a relationship edge directly — nothing here forecloses it, and the two originally-open modeling risks (pair ordering, enum fit) are now resolved in Option 1's favour too, should that day come. It simply isn't buying anything today, at real cost (the ticket's own estimate: "the largest piece of work in the v1.2.0 consistency set").

**Option 4 is accepted independent of the 1-vs-3 call**, per the ticket's own framing — both halves close a real, currently-silent data-integrity gap regardless of which architecture wins.

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

**This argument is real, and the decision above overrides it anyway.** It's an argument that a capability *would* be valuable if the module wanted it — it isn't evidence the module does. Kinesis is single-owner, so the module's whole graph is one person's own subjective map of the people in their life; there is no second account for a "which two records get linked" traversal to arbitrate between, and nothing in how the module is used has asked for a relationship edge to be a link *target* for anything else. The capability this section describes stays real and available the day that changes — Option 1 isn't ruled out, just not worth its cost against a need that hasn't shown up.

## Options

### 1. Bring `Relationship` onto the object layer — not chosen

Give `Relationship` an `objectId`, express person-to-person links as `ObjectRelationship` rows, and retire `RelationshipGoal` in favour of a goal-to-relationship `ObjectRelationship`.

The right long-term shape *if the need shows up*, and the largest piece of work in the v1.2.0 consistency set: schema migration, backfill for existing rows, every read and write path in the module, plus the delete path moving to `deleteObjects`. The `@@unique([userId, firstPersonId, secondPersonId])` guarantee has to survive the move — `pairKey` is the existing mechanism for exactly that, and needs checking against the two-people case before anything is migrated. Not chosen: see Decision above — nothing currently needs another module to link to a relationship edge, so the cost buys nothing today.

### 2. Retire only `RelationshipGoal` — not chosen, same reason as 1

The narrower half. `Goal` is Object-backed; if `Relationship` becomes one, its link to a goal is an ordinary `ObjectRelationship`. Not separable from option 1 in practice — it needs `Relationship` to have an `objectId` first — so it is declined for the same reason as option 1, not independently. `RelationshipGoal` stays as the goal-linking mechanism.

### 3. Record the exemption and move on — chosen

Say in `docs/decisions` that the Relationships module models its own domain and is deliberately outside the universal layer, and drop the expectation. Cheap and honest if the module is not going to grow more link types. It does mean KD-023's "any object to any object" claim is qualified from here on, and the qualification belongs in ADR-006 and KD-024 rather than being folk knowledge. **This is the chosen option — see Decision above.** Follow-up: reflect this qualification in ADR-006 / KD-024 (not yet done; this ticket records the decision, the cross-references still need the note added).

### 4. Add the missing database enforcement regardless — accepted, independent of 1 vs 3

Independent of 1–3, and worth doing on its own — two mechanisms, for the two shapes above:

* **4a. CHECK constraints for gap A.** Enforce "exactly one parent" in the database for the three relationship child tables, and "at most one" for `NotificationRead` and `AttentionDismissal`. Small, mechanical, no API change.
* **4b. Ownership-agreement triggers for gap B.** Extend the `20260904000000_object_ownership_integrity` pattern to `Relationship` (both `Person` endpoints), `ObjectRelationship` (both `Object` endpoints), and `FieldLink` (the field's object and its target). More work than 4a — it's the same shape of migration as 20260903/20260904, including the pre-migration scan that refuses to install a trigger over data that already violates it — but no new design: the function to extend already exists and is already proven in production use.

Both close a class of silent corruption that currently only application code prevents. 4b is the half that would matter most the day a second account exists — a cross-account data-integrity gap in its own right, independent of whatever gets decided between options 1–3.

## Proposed shape (resolved — see Decision)

The original plan here was "Option 4 first, then decide between 1 and 3 before v1.2.0 work is scheduled." The decision is now made: **3, plus 4.** Remaining work is entirely Option 4:

* **4a.** CHECK constraints for gap A, on `ConnectionPractice`, `RelationshipReflection`, `RelationshipImportantDate` (exactly one parent), and `NotificationRead`, `AttentionDismissal` (at most one).
* **4b.** Ownership-agreement triggers for gap B, extending `kinesis_assert_object_attachment` to `Relationship` (both `Person` endpoints, built directly against today's `firstPersonId`/`secondPersonId` — no longer blocked on the 1-vs-3 call), `ObjectRelationship` (both `Object` endpoints), and `FieldLink` (the field's object and its target).

Neither is scheduled yet; this ticket records the decision that unblocks them, not the implementation.

## Open questions

Resolved:

* ~~Does `pairKey` express an unordered person pair correctly, or does `Relationship`'s ordered `firstPerson` / `secondPerson` carry meaning that would be lost?~~ **No meaning would be lost** — confirmed. Moot now that the edge isn't moving onto `ObjectRelationship`, but recorded here since it also clears the way for Option 1 later, should the need arise.
* ~~Is a person-to-person link ever going to want the `ObjectRelationshipType` vocabulary, or is its own free-text `type` the right model?~~ **Free-text is right, and always will be** — relationship type is domain vocabulary (friends, family, dating), not capability vocabulary (`SUPPORTS`/`BLOCKS`). This was one of the two things that tipped the decision to Option 3.
* ~~Do the child tables stay hung off `Relationship` under option 1, or do they hang off its `Object` too?~~ Moot — option 1 not taken, children stay exactly where they are, hung off `Relationship.id` (or `Person.id` for KD-021's self-relationship case, see Related Findings below).
* ~~Does `Relationship`'s half of gap B (4b) get built against today's `firstPersonId`/`secondPersonId` columns, or does it wait for a decision between 1 and 3?~~ Build it now, against today's columns — the decision is made, those columns aren't moving.

Still open:

* `ObjectRelationship` and `FieldLink` aren't part of the Relationships module at all — they're named here only because this ticket is where gap A was already on record. Worth a call on whether 4b for those two stays here or moves to its own ticket once scoped, so this one doesn't quietly become the catch-all for every cross-table ownership gap in the schema.

## Related findings (fixed as part of this ticket)

Working through the Decision above with real examples (a step-parent-like bond that should survive independently of the relationship that introduced it; a pet's birthday known only through someone else) surfaced two more concrete gaps in the Relationships module's own UI. Not about the universal object layer, but folded into this ticket rather than filed separately, since both were small and already scoped by the review above:

* **A person's own facts were already modeled generically, but only exposed for the self-person.** `reconcileChildren` in `app/(app)/relationships/actions.ts` already loops over every `Person` — not just the one with `isSelf: true` — and persists a `practices`/`reflections`/`importantDates` bucket hung directly off that person via `selfPersonId`, independent of any relationship edge; `getRelationshipMap` (`lib/data/relationships.ts`) already reads it back the same way for everyone. The restriction was UI-only: `SelfRelationshipInspector` in `RelationshipMap.tsx` rendered only `if (viewingSelf)`, so a person with no edge at all had nowhere to record anything about them ("Connect this person to someone to add relationship details.").

  **Fixed:** `PersonInspector` now carries its own "Important Dates" and "Notes" sections for every non-self person, bound to that person's existing `selfRelationship.importantDates`/`.notes` — always available, no edge required. "Connection Practices" and "Reflections" deliberately stay off this tab (see the next finding): those describe a specific two-person dynamic, so they belong on a drawn relationship line, not floating on a person with none. The self person is untouched — "Relationship with myself" already covered this, and duplicating it into "Person details" too would just be the same facts twice.

* **A relationship edge between two other people got the same UI as a relationship the account owner is in.** "Connection Practices" and "Reflections" ("ongoing behaviours that maintain this relationship", "how this relationship is going") are inherently first-person — they don't make sense for an edge the account owner is recording as context rather than participating in (e.g. two other people's own relationship to each other).

  **Fixed:** `RelationshipInspector` now only renders those two sections when the account owner (`Person.isSelf`) is one of the edge's two ends. A third-party edge keeps its type, important dates, linked goals, and notes — recording the connection is still useful — and its header text changes from "Shared between two people" to "A connection between two people in your life" to name what it now is.

No schema or data-layer change was needed for either — `lib/relationships.ts`, `lib/data/relationships.ts`, and `app/(app)/relationships/actions.ts` were already generic enough; only `app/(app)/relationships/RelationshipMap.tsx` changed.

## Related

* KD-023 — universal object connection. Its "any object to any object" claim is now qualified by this ticket's Decision; the qualification still needs adding to KD-023 itself.
* KD-024 — universal object capability layer (Done); this is the gap left in it, now deliberately left open rather than closed.
* KD-021 — relationship with oneself; the reason the children carry two nullable parents, and the origin of the `selfPersonId` mechanism the Related Findings above generalize to every person.
* KD-022 — goal-linked relationships; the feature `RelationshipGoal` exists for, and continues to exist for under this decision.
* ADR-006 — Relationship module. Still needs the exemption noted per Option 3 (not yet done).
* `20260903000000_object_integrity_invariants` / `20260904000000_object_ownership_integrity` — the trigger-based pattern gap B (4b) would extend to `Relationship`, `ObjectRelationship`, and `FieldLink`.
