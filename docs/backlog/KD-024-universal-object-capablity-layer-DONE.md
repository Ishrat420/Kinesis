## KD-024 — Universal Object Capability Layer

**Status:** Done 
**Priority:** High
**Tags:** Architecture, Data Model, Technical Debt

### Problem

Kinesis currently has a capability mismatch between custom modules and built-in modules.

`CustomItem` already supports a flexible generic object model with typed fields, links, archive behaviour and user-defined structure.

Built-in modules such as Documents, Goals, Finance and People use bespoke schemas and bespoke editors, but do not consistently share those capabilities.

Examples:

* Documents cannot participate in the same generic custom-field system.
* Goals cannot currently hold arbitrary custom fields.
* Finance items cannot easily gain notes, reminders or Kinesis Links through the same shared mechanism.
* Archive behaviour is inconsistent between object types.
* Cross-module functionality risks being reimplemented independently for each module.

This causes modules to behave as if they **own isolated data**, contrary to the Kinesis principle that objects should exist once and participate in shared capabilities across the application.

### Goal

Introduce a universal Kinesis `Object` identity and capability layer.

Built-in modules should retain their specialized schemas, behaviour and UI, while shared capabilities operate against the universal Object rather than being reimplemented per module.

Core principle:

> **Objects belong to Kinesis, not Modules. Modules provide specialized ways to create, understand and manage them.**

### Architecture direction

Introduce a universal Object identity.

Conceptually:

```ts
Object {
  id
  userId
  type
  name

  archivedAt?
  createdAt
  updatedAt
}
```

Typed domain models remain separate and reference the Object:

```ts
Document {
  objectId
  documentType
  expiryDate
  issueDate
  ...
}

Goal {
  objectId
  targetDate
  status
  ...
}

FinanceItem {
  objectId
  amount
  frequency
  ...
}

Person {
  objectId
  ...
}

CustomItem {
  objectId
  ...
}
```

Do **not** convert all built-in models into `CustomItem`.

### Built-in vs custom fields

Preserve domain-specific fields where Kinesis understands their meaning.

Examples:

* Goal target date
* Goal metric
* Document expiry date
* Finance amount
* Finance frequency

These fields power deterministic Kinesis behaviour and should remain typed.

Custom fields should extend those objects rather than replace their built-in schema.

Example:

```text
Buy a house

Built-in
Target date: 2032
Status: Active
Metric: $38,400 / $100,000

Custom
Preferred suburb: Ringwood
Broker: Sarah
Priority: High
```

Principle:

> **Typed fields power the product. Custom fields extend the object.**

### Shared object capabilities

The universal Object layer should become the attachment point for shared capabilities such as:

* Connections / backlinks
* Custom fields
* Notes
* Reminders
* Archive
* Activity/history
* Attachments or external references where applicable

Conceptually:

```text
Object
├── Connections
├── Custom fields
├── Notes
├── Reminders
├── Archive
├── History
└── References / attachments
```

Not every capability must be implemented in this KD immediately. This KD establishes the architecture that allows them to be implemented consistently.

### Module behaviour

Built-in modules should remain specialized experiences.

Do not replace:

* Goal Milestones
* Goal metrics
* Document expiry/reminder behaviour
* Finance calculations
* Relationship constellation
* module-specific layouts

with one generic object-detail page.

The shared layer is about common **capabilities**, not forcing identical UI.

### Custom modules

Treat the existing Custom Module / Custom Item system as a strong foundation rather than something to replace.

Where practical, promote generic capabilities already developed for Custom Items so they can work with any eligible Kinesis Object.

Over time:

```text
Custom module
→ presents/manages Objects

Built-in module
→ presents/manages specialized Objects
```

rather than each module becoming an isolated storage silo.

### Relationship to KD-023

KD-024 should provide the foundation for **KD-023 — Universal Object Connections & Backlinks**.

Preferred relationship model:

```ts
ObjectRelationship {
  sourceObjectId
  targetObjectId
  type?
}
```

rather than polymorphic raw IDs such as:

```ts
fromType
fromId
toType
toId
```

where avoidable.

KD-023 and KD-024 should therefore be planned together, with KD-024 establishing the universal identity layer first.

### Migration approach

Do not attempt a destructive one-shot rewrite.

Recommended stages:

1. **Universal identity**

   * Add Object.
   * Add `objectId` to Document, Goal, FinanceItem, Person and CustomItem.
   * Backfill existing records.
   * Preserve existing behaviour.

2. **Universal connections**

   * Implement KD-023 using Object IDs.
   * Stop introducing new cross-module-specific join tables where generic relationships are sufficient.

3. **Promote shared capabilities incrementally**

   * Custom fields
   * Notes
   * Reminders
   * Archive
   * History

4. **Legacy cleanup**

   * Remove redundant per-module mechanisms only after migration is stable.

### Rules

* A domain record should have one stable Object identity.
* Object identity must survive ordinary edits.
* Module-specific deletion/archive rules must not create orphaned shared capability records.
* Shared capabilities should respect existing authorization and ownership.
* Do not make every internal database row an Object.
* Logs, snapshots, occurrences and other supporting records should remain domain/internal records unless there is a clear user-facing reason for universal identity.

### Initial universal object candidates

At minimum:

* Document
* Goal
* Finance Item
* Person
* Custom Item

Evaluate separately:

* Relationship
* Goal Milestone
* other future system objects

### Out of scope

* Rebuilding all built-in modules using the CustomItem schema
* One universal generic detail page
* Migrating every existing join table immediately
* AI object classification
* Graph visualization
* Automatic relationship inference
* Making all internal database records user-linkable

### Acceptance criteria

* A universal Object model exists.
* Major user-facing domain records have stable Object identities.
* Existing built-in module behaviour remains intact.
* Custom Items also participate in the Object layer.
* Architecture supports attaching shared capabilities to Object rather than duplicating implementations per module.
* KD-023 can use Object IDs for universal connections/backlinks.
* Built-in typed fields remain typed and continue powering domain behaviour.
* Custom fields can be progressively extended to built-in objects without converting them into CustomItems.
* Existing user data is migrated safely without destructive loss.
* No unrelated visual redesign is introduced as part of the foundation work.

### Product principle

> **Kinesis should feel like one connected system with specialized experiences on top — not a collection of separate module databases.**
