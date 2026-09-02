# KD-008 — Add To-do via quick capture 

**Status:** Accepted — Needs Planning
**Priority:** High

## Summary

Introduce **Quick Capture** as a fast way to record something without requiring the user to immediately decide where it belongs in Kinesis.

The purpose is simple:

> Capture now. Organise later.

## Behaviour

Upgrade the existing search bar into a global **search-and-create command bar**, available from anywhere through:

* Clicking the search bar
* `⌘K` on Mac
* `Ctrl+K` on Windows

The interaction could be:

```text
Update new passport details
```

Results:

SEARCH RESULTS

Passport Somalia                         Document
Passport Australia                       Document

CREATE

＋ Create “Update new passport details” as To-Do
  Create as Goal
  Create as Document
  More options…

The default action should be **Create as To-Do**
The fastest way would be: 

1. Press Ctrl+K or click the global search bar.
2. Type Update new passport details.
3. Press Enter.
4. Kinesis creates a standalone To-Do immediately.

```text
✓ To-Do created: Update new passport details        Add details · Undo
```

Selecting Add details could open a small second step:

To-Do Update new passport details

Turn into:
[ Document ] Optional // this is a DDL 

link to:
[ e.g. Passport Somalia ] Optional // Kinesis Link 

Status: 
[ Select status ] Optional

Due:
[ Select date ] Optional


[Save changes]

Here, this will be smart 
For example, the user might want to:
Create as: To-Do
Link to: Passport Somalia

The first decides what the new record is.
When selected, the software should decide the rest. 
For example, 

To-Do Update new passport details

As soon as user decides they will turn it into a Document, available fields should change according to Create as...

You can redirect them to that create page, with the name populated already. 
If they turn this into person, then maybe redirect them to relationship and create that person buble already for them to see. 
It should be seamless. 

What we should prevent is, for example, they were able to enter due date and then turn this into a people/relationship, now it's going to be an issue as relationship do not have due date. 

Available status for now would be the following: 

To do
Waiting
Done

## Recommended delivery order

1. **KD-008A — Global Command Bar**

   * Search existing records
   * Create standalone to-do from any page
   * Title-only creation
   * Success feedback and Undo
   * Keyboard and mobile entry points

2. **KD-008B — Standalone To-Dos**

   * Status and optional due date
   * Edit, complete and delete
   * Basic To-Do page

3. **KD-008C — Unified Action View**

   * Aggregate milestones, reminders, practices and expiries
   * All/Standalone/Connected filters
   * Source-aware actions and navigation

4. **KD-008D — Organise Later**

   * Link a task to an existing object
   * Convert a task into a richer object
   * Preserve conversion history


