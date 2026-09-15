## KD-022 — Goal linked relationships

**Status:** Done
**Priority:** Medium
**Tags:** UX/UI

### Requirement

Allow Goals to be linked to other Goals using a small set of meaningful relationship types, so Kinesis can represent how large or long-term goals depend on, support, or interact with other goals.

This should complement Milestones rather than replace them.
Some outcomes are too substantial to be represented as milestones of another goal.

Example:

**Buy a house**

* Save $25,000
* Save $50,000
* Get mortgage pre-approval
* Begin inspections

These are valid milestones.

However:

**Get a higher-paying job**

is an independent Goal with its own milestones and planning, while still contributing to **Buy a house**.

Kinesis should therefore support Goal-to-Goal relationships rather than forcing all decomposition into milestones or hierarchical subgoals.

### Initial relationship types

| Relationship   | Inverse          | Meaning                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| **Supports**   | **Supported by** | Helps another goal succeed                      |
| **Blocks**     | **Blocked by**   | Prevents meaningful progress                    |
| **Depends on** | **Required for** | One goal should happen before or enable another |
| **Related to** | **Related to**   | Connected without stronger semantics            |
| **Alongside**  | **Alongside**    | Intended to progress together                   |

Relationships must display correctly from either side.

Example:

```text
Get a higher-paying job
supports → Buy a house
```

and:

```text
Buy a house
supported by → Get a higher-paying job
```

### UX

Add a **Linked Goals** / **Related Goals** section to Goal detail.

User can:

* Link an existing Goal.
* Select the relationship type from a dropdown.
* Open the linked Goal.
* Change the relationship type.
* Remove the relationship.

Example:

```text
Linked Goals

Supports
↗ Buy a house

Blocked by
↗ Pay off credit card

Related to
↗ Move closer to work
```

Do not introduce parent/child Goal hierarchy or nested subgoals.

### Behaviour

* Prevent self-linking.
* Prevent duplicate relationships between the same two Goals.
* Relationship direction must be stored consistently and rendered using the appropriate inverse.
* `Related to` and `Alongside` are symmetrical.
* Removing a relationship must not delete either Goal.
* Archiving a Goal must not silently remove its relationships.
* No automatic Goal progress calculation based on linked Goals in the initial implementation.

### Relationship vocabulary

Use the curated built-in relationship types above.

**Do not allow arbitrary user-created relationship types in this iteration.**

The vocabulary should remain small and understandable so the relationships retain consistent meaning across Kinesis.

### Architecture

Prefer implementing this through the planned/generalized `ObjectRelationship` model rather than creating a narrowly-scoped `GoalRelationship` table, if the universal Object architecture is ready.

Conceptually:

```ts
sourceObjectId
targetObjectId
type
```

with types such as:

```ts
SUPPORTS
BLOCKS
DEPENDS_ON
RELATES_TO
ALONGSIDE
```

The initial UI may restrict relationship creation to **Goal ↔ Goal**, even if the underlying model can later support relationships between other Kinesis objects.