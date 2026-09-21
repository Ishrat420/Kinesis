## KD-023 — Universal Object Connections & Backlinks

**Status:** In Progress -- the core architecture below shipped, mostly
under later, more specific tickets (KD-024, KD-049, KD-050) that this
ticket's own doc was never updated to reflect. Two concrete gaps remain;
see "What's left" below.
**Priority:** High
**Tags:** Architecture, UX/UI
**Planned Release:** v1.3.0

## What's been done

Everything below was confirmed by reading the current code, not assumed
from other tickets' own claims:

* **The `Object` + `ObjectRelationship` layer exists**, matching this
  ticket's "Preferred direction" sketch almost verbatim --
  `sourceObjectId`/`targetObjectId`/`type`/`customLabel`/`createdAt`/
  `updatedAt` on `ObjectRelationship`, sitting on top of the universal
  `Object` identity table. Built under **KD-024 (Universal Object
  Capability Layer, Done)** and **KD-049 (Typed Kinesis Link
  Connections, Done)**.
* **All 5 minimum linkable types are supported, plus a 6th.**
  `lib/custom-fields/types.ts`'s `KINESIS_LINK_TARGET_CONFIG` enables
  Document, Custom Item, Goal, Finance Item, Person, and To-Do as valid
  link targets -- everything this ticket named as a minimum, plus To-Do.
* **Relationships are stored once; backlinks are derived, not
  duplicated** -- exactly as this ticket specified ("Do not create
  duplicated forward/reverse rows solely to render backlinks"). One
  `ObjectRelationship` row plus an `inverse` flag per side is resolved
  at render time by `kinesisLinkLabel(type, inverse)` into human-facing
  text ("Depends on" / "Required for", "Supports" / "Supported by",
  etc.) -- never raw `source`/`target` terminology, per this ticket's
  own UX requirement.
* **A real Connections UI exists** -- add, view, and remove a link, with
  both outgoing links and incoming backlinks shown together on the same
  object's page -- on Document, Goal, and Custom Item detail pages
  (`KinesisLinks.tsx`, `getKinesisLinks`/`getKinesisLinkOptions`).
* **The behavioural guards this ticket asked for are in place and
  tested:** self-links refused, a same-type duplicate refused (in
  either direction), linking to another account's object refused,
  removing a connection deletes only the relationship row, never either
  connected object.
* **KD-048 (Object Event Model, Done)** layered a full change history on
  top of this same graph (`RELATIONSHIP_ADDED`/`REMOVED`/`CHANGED`
  events, paired per endpoint) -- a real second consumer proving the
  shared graph, not just the Kinesis Links UI, actually works as a
  general-purpose layer.

## What's left

* **Finance Item and Person have no Connections UI on their own pages,
  despite being valid link targets.** Confirmed by reading
  `app/(app)/finance/[itemId]/page.tsx` -- it loads History but never
  calls `getKinesisLinks`. Confirmed by reading the Relationships map's
  Person inspector -- it shows the separate Person-to-Person
  `Relationship` model, never a Kinesis Link backlink. In practice: a
  Document or Goal can link *to* a Finance Item or a Person today, but
  neither can ever see that link from their own side. 2 of this
  ticket's 5 minimum named types are missing the UI half of "every
  object can render both outgoing connections and incoming backlinks."
* **The audit this ticket itself calls for was never done.** Its own
  text says: "identify overlapping semantics, define which
  relationships belong in the universal graph... stop introducing new
  cross-module-specific join tables where the universal relationship
  model is sufficient." `RelationshipGoal` (a connection's linked
  goals) and the Person-to-Person `Relationship` model (the
  Relationships map's own connections, including their Important
  Dates/Practices/Reflections/Linked Goals) both remain separate,
  unmigrated join tables to this day -- not necessarily *wrong* to leave
  separate (this ticket explicitly allows "specialized joins may remain
  where they represent genuine domain semantics"), but that call was
  never actually made and written down anywhere. **KD-051 (History for
  a Connection's Own Facts)** independently ran into this same
  boundary while designing audit history for a connection's own
  collections, so the two tickets should be read together when this is
  picked up.
* **Search doesn't yet leverage the shared graph**, per this ticket's
  own "should eventually" note. Confirmed low-priority as originally
  written -- each search provider (`lib/search/providers.ts`) queries
  its own table directly today; not blocking, just unbuilt.
* **Not yet resolved:** whether `RelationshipGoal`/`Relationship`
  migrating into `ObjectRelationship` is worth doing at all, versus
  formally deciding they're permanent, genuine-domain-semantics
  exceptions per this ticket's own allowance. This is the actual
  planning decision left in "Accepted -- Needs Planning" terms, now
  narrowed from "design the whole architecture" (done) to "decide the
  fate of two specific legacy join tables and build two specific
  missing UI sections."

### Problem

We have principle
 
> **Objects exist once. Connections are shared. Every meaningful relationship should be visible from both sides.**

Kinesis currently has multiple disconnected linking mechanisms and only renders links in the forward direction.

Current limitations:

* `KINESIS_LINK` fields can exist on Documents and Custom Items and point to a Document, Custom Item, or Goal.
* Reverse relationships are not rendered.

  * If a Document links to a Goal, the Goal cannot see that the Document references it.
  * No object page has a consistent `Connections`, `Linked from`, or `Referenced by` view.
* Goals cannot currently hold Kinesis Link fields.
* Finance items and People cannot participate fully as link targets.
* Relationships use a separate `RelationshipGoal` join table, creating a parallel linking system that does not participate in the existing Kinesis Link graph.

This undermines the core Kinesis principle that life-admin objects should be interconnected rather than isolated by module.

### Goal

Introduce a universal object-to-object relationship layer so any meaningful Kinesis object can link to another, and every object can render both:

* outgoing connections
* incoming backlinks

Kinesis should be able to answer:

= What does this object connect to?

and:

= What else in Kinesis references this object?

> Need to find out 

How does existing linked goals fit into this picture 

### Architecture

Introduce a generalized relationship/edge model rather than continuing to add module-specific join tables.

Conceptually:

```ts
ObjectRelationship {
  id

  sourceObjectId
  targetObjectId

  type?
  label?

  createdAt
  updatedAt
}
```

This should preferably sit on top of the planned universal `Object` identity layer rather than storing raw polymorphic `{type, id}` pairs where avoidable.

Preferred direction:

```ts
Object {
  id
  type
  ...
}

ObjectRelationship {
  sourceObjectId
  targetObjectId
  type?
  label?
}
```

Typed domain records remain separate and reference their universal Object identity.

### Initial linkable object types

At minimum:

* Document
* Goal
* Custom Item
* Finance Item
* Person

Relationship records should be considered for migration into this system where practical, but do not force every internal/supporting row in Kinesis to become a universal object.

### Connections UI

Add a consistent **Connections** section/panel to applicable object detail pages.

Example:

```text
Connections

LINKS TO
Goal
↗ Buy a house

Document
↗ Mortgage pre-approval

REFERENCED BY
Finance
↗ House deposit

Person
↗ Anj
```

Users should be able to:

* see outgoing links
* see backlinks
* navigate to connected objects
* add a connection
* remove a connection where permitted

Do not require the user to understand edge direction terminology such as `source` or `target`.

Use human-facing labels such as:

* Linked objects
* Connections
* Referenced by
* Linked from

### Kinesis Link fields

**See KD-049** for the typed/bidirectional-labelling half of this — generalizing the relationship types Goal↔Goal already uses (`ObjectRelationship`, `lib/goals/relationships.ts`) into a Kinesis Links section on every Object. KD-049 deliberately treats `KINESIS_LINK` custom fields as related but distinct rather than assuming they should merge into this layer — whether they ever share infrastructure is left as a later investigation, not a planned migration.

Existing `KINESIS_LINK` custom fields should eventually use the same universal relationship layer rather than maintaining separate semantics.

A Kinesis Link field may still appear as a field in the UI, but its relationship should be represented in the shared graph so backlinks work automatically.

Example:

```text
Document:
Related goal → Buy a house
```

must cause the Goal to show:

```text
Referenced by
Document → Passport
```

without storing a second manual reverse link.

### Existing relationship systems

Audit module-specific linking tables such as:

```text
RelationshipGoal
```

Do not immediately remove or rewrite them if doing so creates unnecessary migration risk.

Instead:

1. identify overlapping semantics
2. define which relationships belong in the universal graph
3. migrate incrementally
4. stop introducing new cross-module-specific join tables where the universal relationship model is sufficient

Specialized joins may remain where they represent genuine domain semantics rather than generic linking.

### Relationship direction

Relationships must be stored once.

Backlinks are derived from the same relationship record.

Do not create duplicated forward/reverse rows solely to render backlinks.

For example:

```text
Document A → Goal B
```

is one relationship.

Goal B derives:

```text
Referenced by → Document A
```

### Behaviour

* Prevent self-links where inappropriate.
* Prevent accidental duplicate edges.
* Deleting a connection must not delete either connected object.
* Archiving an object should preserve its relationship history unless intentionally removed.
* Deleted objects must not leave broken navigational references.
* Authorization must be checked for both source and target objects.
* Search/navigation should eventually be able to leverage the shared graph.

### Migration considerations

Before implementation, audit:

* `KINESIS_LINK`
* Document links
* Custom Item links
* `RelationshipGoal`
* Goal relationships
* Finance relationships
* Person/Relationship links
* any other domain-specific cross-module joins

Define which should:

* migrate to `ObjectRelationship`
* remain specialized
* temporarily coexist

Avoid a destructive one-shot migration.
This is a foundational architecture change and should be resolved before significantly expanding additional cross-module relationship features.