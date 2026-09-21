### KD-011 — Unified To-Do View

**Status:** Done
**Priority:** Medium
**Tags:** UX / UI, Foundation Dependent
**Planned Release:** v1.3.0

## Summary

Explore a unified **To-Do** view that brings actionable items from across Kinesis into one place.

Potential sources included: milestones/Important dates/Custom due dates, plus:

* Goal and milestones due dates
* Document expiries and reminders
* Relationship Important Dates (both person's and Shared)
* Custom module reminders
* User-created to-dos
* Any other Upcoming reminders and due dates

Example (the shape this ticket asked for):

```text
□ Passport is expiring soon                 Document
□ Reach $25k savings                        Goal
□ Peach's Birthday                          Relationship
□ Call Mum                                  Relationship
□ Book car service                          Vehicle
□ Buy light bulbs                           Personal
```

## Closing decision

**The dashboard's "Upcoming & Due" widget (`lib/data/upcoming.ts`'s
`getUpcomingAndDue`, rendered by `components/dashboard/ReminderList.tsx`)
*is* the unified view and action centre this ticket asked for.** This
was the one open question the ticket left unresolved ("Consider whether
this should replace or expand the existing Upcoming & Due dashboard
experience rather than introducing another competing dashboard
component") — decided now, in favor of Upcoming & Due, rather than
building a second, separate page that would show the same facts a
different way.

Confirmed by reading `getUpcomingAndDue` directly: it already unions
every source this ticket named into one list --

* `document` — expiring/expired documents
* `milestone` — goal milestones due soon or overdue
* `relationship` — shared and self Important Dates
* `todo` — user-created To-Dos, due soon or overdue
* `custom` — custom module reminders
* `goal` — a goal past its own target date (overdue only, no
  advance-notice phase -- a deliberate choice from the earlier
  goal-overdue work, not a gap here)

-- each dismissible independently where that makes sense (documents,
custom items, relationships, via the shared `AttentionDismissal` table
also used by Needs Attention), sharing the reminder lead-day settings
account owners already control.

**Other surfaces remain, deliberately, for their own granular
purposes -- they are not duplicating this ticket's job, they're each
answering a narrower question Upcoming & Due isn't for:**

* **`/todos`** -- managing To-Dos specifically: creating, editing,
  linking, and the **All / Standalone / Connected** filters this ticket
  originally asked for (`TodoBoard.tsx`, `todo.links.length === 0` vs
  `> 0`). This is "show me my To-Dos," not "show me everything due" --
  the two are different jobs and this ticket's own filters belong here,
  not on the dashboard.
* **`/goals`, `/documents`, `/custom-modules/...`, `/relationships`** --
  each module's own list/detail view for browsing and managing its own
  records at leisure, independent of anything being due.
* **Needs Attention** (`lib/data/attention.ts`) -- a related but
  distinct surface: overdue-only, no lead-day advance notice, and its
  own dismissal semantics (ADR-010). Upcoming & Due and Needs Attention
  intentionally overlap in source but not in framing -- one is "coming
  up," the other is "needs a decision now."

## Standalone To-Dos (Done)

Users can create simple to-dos without first assigning them to a
module, optionally with a due date, via Quick Capture (KD-008) or
directly on `/todos`. A standalone to-do can be linked to, or converted
into, an established Kinesis object (KD-008's own conversion flow).

## Views (Done)

**All / Standalone / Connected** filtering exists on `/todos`
(`TodoBoard.tsx`), scoped to To-Do records specifically -- not to the
account-wide due/upcoming set, which is Upcoming & Due's job per the
closing decision above.

## Related

- **KD-008 (Quick Capture)** -- delivered; the source of every
  standalone To-Do and its conversion path into a richer record.
- **KD-017 (Dashboard as a decision surface, Done)** -- `getUpcomingAndDue`
  is sourced from its shared `getAttentionRecords`/Phase 1 read, the
  same data Needs Attention reads, so the two surfaces can never quietly
  disagree about what's overdue.
- **KD-028 (Goal lapse awareness, Done)** -- the reason a goal only
  ever appears in Upcoming & Due once overdue, never as an advance
  "due soon" notice; a deliberate design choice this ticket inherits
  rather than a gap in it.
---
