# KD-008 — Add To-do via quick capture 

**Status:** Done — KD-008A, KD-008B and KD-008D delivered; KD-008C handed to KD-011
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

---

## What was delivered

### KD-008A — Global Command Bar — done

The search bar is now a command bar (`components/capture/CommandBar.tsx`), reachable
by clicking it or with `⌘K` / `Ctrl+K` from any page. It shows search results
above a **Create** section, and Enter takes the default — create a To-Do — so
capture never requires choosing a destination first.

Feedback appears in place rather than by navigating away: a confirmation with
**Add details** and **Undo** (`CaptureConfirmation.tsx`).

### KD-008B — Standalone To-Dos — done

`Todo` is a sixth Object-backed model, so a To-Do is searchable, linkable and
deletable through the machinery every other module already uses. Statuses are
**To do / Waiting / Done** (`lib/todos/status.ts`); the due date is optional.

`/todos` lists them with All / Standalone / Connected filters, inline status
changes, complete, edit and delete. Overdue To-Dos also reach **Needs
attention** and **Upcoming & Due** on the Dashboard, so a capture with a date
behaves like every other dated thing Kinesis knows about.

### KD-008D — Organise later — done

"Turn into" is driven by a registry (`lib/capture/targets.ts`) that records, per
target, which captured details that kind of record can actually hold. That is
what answers the problem this ticket raised:

> What we should prevent is, for example, they were able to enter due date and
> then turn this into a people/relationship […] as relationship do not have due
> date.

The details step shows only the fields the chosen target carries, and names
anything that would be lost before the user commits — it never drops a value
silently. A Goal receives the due date as its target date; a Document does not
receive one at all, because a document's expiry is a fact about the document
rather than an action's deadline.

Converting redirects to that module's own create surface with the title (and any
carried detail) prefilled. The To-Do is retired only once the richer record
actually exists, so abandoning the form loses nothing, and the conversion is
recorded in the activity feed as `Update passport → Passport Somalia`.

### KD-008C — Unified Action View — not delivered here

This overlaps almost entirely with **KD-011 — Unified To-Do View**, which owns
the same aggregation (milestones, expiries, reminders, practices) and the same
All / Standalone / Connected filters. Building it twice would produce two
competing surfaces, which KD-011 explicitly warns against.

What KD-008 needs from it is in place: the filters exist on `/todos`, and dated
To-Dos already appear in the Dashboard's awareness surfaces. Aggregating the
other sources is left to KD-011.

## Notes for whoever picks this up next

* **Adding a capture target** (Finance, Person, a custom module) is one entry in
  `CAPTURE_TARGETS` plus reading `readCaptureParams` on that module's page. The
  registry decides the ordering, the labels, and which details carry.
* **"More options…"** from the mock above is not rendered: every registered
  target is currently promoted, so there is nothing behind it. It becomes real
  as soon as a target is registered with `promoted: false`.
* **KD-025's "who has the ball"** extends `TODO_STATUS_CONFIG` rather than
  replacing it. `isOpenTodoStatus` is the one question the rest of the
  application asks of a status, so a new state declares its own answer there and
  every counting surface follows.
