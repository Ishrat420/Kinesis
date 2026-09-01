## KD-023 — Universal Object Connections & Backlinks

**Status:** Accepted — Needs Planning
**Priority:** High
**Tags:** Architecture, UX/UI

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