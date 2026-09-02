### KD-011 — Unified To-Do View

**Status:** Accepted — Needs Planning
**Priority:** Medium
**Tags:** UX / UI, Foundation Dependent

## Summary

Explore a unified **To-Do** view that brings actionable items from across Kinesis into one place.

Potential sources include:

* Goal milestones
* Document expiries
* Upcoming reminders
* Relationship practices
* Custom module reminders
* User-created standalone to-dos

Example:

```text
To-Do

□ Renew passport                 Document
□ Reach $25k savings             Goal
□ Call Mum                       Relationship
□ Book car service               Vehicle
□ Buy light bulbs                Personal
```

## Standalone To-Dos

Users should also be able to create simple to-dos without first assigning them to a module.
They maybe able to attach a due date on it too. 

A standalone to-do may later be linked or converted into an established Kinesis object, goal, reminder, etc.

Consider integration with **KD-008 — Quick Capture**.

## Views

Explore simple filtering between:

* **All**
* **Standalone**
* **Connected**

Consider whether this should replace or expand the existing **Upcoming & Due** dashboard experience rather than introducing another competing dashboard component.

## Related

- KD-008 Add a quick capture — **delivered**, and it left this ticket the whole
  aggregation question. Standalone To-Dos, the All/Standalone/Connected filters
  over them, and dated To-Dos in Needs Attention and Upcoming & Due are already
  in place (`/todos`, `lib/data/todos.ts`). What remains here is gathering the
  *other* sources — milestones, expiries, reminders, practices — into one view,
  and deciding whether that replaces Upcoming & Due rather than competing with it.
  KD-008C was deliberately not built separately to avoid exactly that competition.
---