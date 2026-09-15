# KD-036 — Object Types Navigation & Standalone Object Flow

**Status:** Dropped
**Priority:** ~~Medium~~
**Tags:** UX / UI

## Why dropped

This ticket proposed a dedicated **OBJECT TYPES** sidebar section for
module-less standalone objects, built on a **Module / Object / Object Type**
vocabulary where an Object Type was a reusable structure that objects could be
created from *without* belonging to a Module.

Working through it (alongside the sibling tickets on goal details, multi-value
links, and standalone object types) surfaced a structural problem: **a Module
holding exactly one Object Type, with a generic list screen, is indistinguishable
from an Object Type's own screen.** There was nothing left for a module to be
that a single-type Object Type screen wasn't already. Two names, one thing.

Chasing that down further also surfaced that building genuine standalone
(module-less) objects was a larger foundation project than it first looked:

* `CustomItem` has no `userId` of its own — ownership is derived through
  `module: { userId }` at seven separate query sites (notifications, Needs
  Attention, calendar, Upcoming & Due, quick-capture dismissals, and two module
  action checks). A module-less object would not error in any of them — it
  would be **silently invisible** to reminders, Needs Attention and the
  calendar, which is a far worse failure than a crash.
* `Object.name` is maintained by database trigger from the typed record's own
  name column, and rejects a mismatched direct write. Any standalone object
  needs a real, always-present name column of its own — "Title" can't be just
  another configurable field, contrary to this ticket's own worked example.
* `locateObject` (`lib/objects/locations.ts`) builds a custom item's href *from
  its module*, and `ObjectLocation.module` is a required string. Every surface
  that offers objects to link to or search for reads it. Module-less objects
  break link resolution, the Kinesis Link picker, quick capture's "Link to" and
  search results until that's reworked too.

None of that is a reason on its own to avoid standalone objects — it's real,
buildable work. But once the two-concepts-collapse problem above was on the
table, the smaller and cleaner answer was to **not build standalone objects at
all**: keep every object inside a module (as today), and instead let a module
optionally follow a reusable **Template** for its structure.

**KD-035 is the replacement.** It keeps the genuinely valuable idea from this
ticket — reusable structure someone doesn't have to re-invent per record — and
drops the parts that turned out to be solving a problem the model itself had
created: a second navigation concept, a second way to be "location-less," and
the ownership/identity/linking rework above. Under KD-035, creating a "Decision"
record still takes one click once its module exists, and the sidebar stays a
list of modules — nothing new to add there, and nothing new to teach in
onboarding beyond **Module, Template, Object**.

If a genuine need for a record that belongs to no module ever surfaces — something
that isn't well described as "a module I haven't organised yet" — the ownership
and identity work catalogued above is where to start, not the sidebar section
this ticket proposed.

---

## Original proposal (kept for reference)

# Object Types Navigation & Standalone Object Flow

**Status:** Accepted — Needs Planning
**Priority:** Medium
**Tags:** UX/UI

## Summary

Add a new sidebar section called:

> **OBJECT TYPES**

This will provide a dedicated home for standalone custom Objects created from reusable Object Types.

For now, Kinesis will intentionally use the terms **Module**, **Object**, and **Object Type** in the product. These concepts should also be reinforced during onboarding so users understand the Kinesis mental model and terminologies.

## Why

Standalone Objects need a clear place to live and be discovered.

They should not require a Module, but they also should not disappear into search-only workflows.

Object Types provide a reusable structure for independent Objects such as:

- Decisions
- Applications
- Ideas
- References
- Purchases

## Sidebar Direction

Example:

```text
OVERVIEW
Dashboard
To-Dos
Calendar

MODULES
Documents
Finance
Goals
Relationships
Home

OBJECT TYPES
Decisions
Applications
Ideas

Settings
```

Only Object Types that the user has chosen to expose in navigation should appear here.

The section should support adding more Object Types without turning the sidebar into an uncontrolled list.

## User Flow

### Create an Object Type

```text
Settings
→ Object Types & Templates
→ New Object Type
→ Start blank or use template
→ Configure fields
→ Save
```

Example:

```text
Object Type: Decision

Fields
- Title
- Date
- Why?
- Kinesis Links
- Notes
```

### Use an Object Type

Once created:

```text
OBJECT TYPES
→ Decisions
```

opens a list of all standalone Decision Objects.

From there:

```text
Decisions
→ + New Decision
→ fill fields
→ Save
```

The resulting Decision is a normal Kinesis Object, independent of any Module.

### Create from global capture

Existing Object Types should also become available through global creation/capture where appropriate:

```text
+ Create

To-Do
Goal
Document
Decision
Application
...
```

Selecting an Object Type opens its configured creation form.

## Object Type Screen

Each Object Type should have a simple list view containing its Objects.

Example:

```text
Decisions

+ New Decision

8 Sep 2026
Buy in Brunswick

2 Sep 2026
Use broker Jane Smith
```

The screen should use the configured fields where useful, but avoid trying to create a fully custom database/table builder initially.

## Navigation Behaviour

Creating an Object Type should not necessarily force it into the sidebar.

Support a setting such as:

```text
Show in sidebar
[✓]
```

or an equivalent pin/unpin action.

If no Object Types are visible, the `OBJECT TYPES` section may be hidden.

## Terminology

For this iteration:

* **Module** = an organised area/domain containing Objects
* **Object** = an individual meaningful record
* **Object Type** = a reusable structure for standalone Objects

These terms should be used consistently in onboarding and relevant UI.

## Guardrails

* Reuse the configurable Object/custom-field engine where practical.
* Do not create separate implementations for Module Objects and standalone custom Objects unless necessary.
* Object Types should define structure, not arbitrary application behaviour.
* Do not automatically create sidebar clutter.
* Preserve Universal Object identity, ownership, linking, archive, and other shared capabilities.

The key UX distinction is:

> **Modules organise areas of life. Object Types organise kinds of standalone records.**

That should make the sidebar concept fairly intuitive once onboarding teaches the vocabulary.
