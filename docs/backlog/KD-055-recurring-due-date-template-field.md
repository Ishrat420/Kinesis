# KD-055 — Recurring Due Date as a Template Field

**Status:** Accepted
**Priority:** Medium
**Tags:** Data Model, UX / UI, Improvement

## Summary

A Custom Item template can offer a **Recurring Due Date** as an alternative
to the existing Due Date field (KD-038). An object under that template has
one due date that repeats every _N_ days: completing the current occurrence
moves the same object's due date forward to the next one, and the reminder
surfaces (Needs Attention, the bell, Upcoming & Due, the calendar) follow
that date exactly as they already follow an ordinary due date.

```text
Template: Car Service
  Fields
  - Garage (Text)
  - Recurring due date  ← its own action, its own "repeat" icon

Object: Service the Golf
  Recurring due date   12 Nov 2026   every 180 days   [✓]
                                                       │
  click ✓ ─────────────────────────────────────────────┘
    → ObjectEvent logged: occurrence of 12 Nov 2026 completed
    → dueDate becomes 11 May 2027
    → same object, same links, fields and notes
```

## Scope

**In:** Custom Item templates only, for the same reason as KD-038: KD-035
Decision 3 means Custom Item is the only object type that can follow a
template.

**Out:**

* System modules (Document, Goal, Relationship, Finance, Person). The same
  exclusion-by-construction as KD-038 / ADR-011.
* Calendar-style recurrence rules ("first Monday of the month", "every
  month on the 15th"). v1 is a fixed interval in days only.
* KD-006's general "reminder on any object" feature. This ticket is the
  narrower Custom Item version; see **Related**.

## Decisions

### 1. Due Date *or* Recurring Due Date, never both

The template editor gets a **"+ Add recurring due date field"** action next
to KD-038's "+ Add due date field". A template may have at most one of the
two: once either one exists, both actions show as unavailable. As with
KD-038 Decision 4, this is enforced twice: the UI hides the option, and
`updateTemplate` refuses a save that would end up with both, or with two of
either. Add a database backstop alongside KD-038's partial unique index,
so that at most one row per template is a due-date-like field.

### 2. Its own icon

A recurring due date field gets its own repeat-style icon (e.g. lucide
`Repeat` / `CalendarSync`). It must differ from the plain due date's
`Clock3`. The icon appears in the template editor's add button, in its
fixed type badge, and next to the value on the object page. The type cell
is a fixed badge, not a dropdown, exactly as in KD-038 Decision 2. The label
stays editable.

### 3. Filling it in asks two things

On the object page (create and edit), the field asks:

1. **Date**: the next or current occurrence.
2. **Repeats every … days**: a positive whole number.

Both are required together: a date with no interval, or an interval with no
date, is a validation error rather than a half-saved recurrence.

### 4. One row that moves, not a row per occurrence

The object keeps a single record, and its due date moves forward.

* The current occurrence lives in the existing `CustomItem.dueDate`, the
  same column KD-038 writes to. Needs Attention, notifications, Upcoming &
  Due and the calendar already read that column, so they pick up the
  current occurrence with no new reader.
* The interval is stored alongside it, e.g. a new nullable
  `CustomItem.recurrenceDays Int?`. It is set only when the item's
  template has a recurring due date field.
* Past occurrences are **not** rows. They live in the `ObjectEvent` stream
  (see Decision 6), so links, fields and notes all stay on one object.

### 5. What moves the date forward: a complete-occurrence check

A check-box-style action sits next to the recurring due date on the
object page. Clicking it:

1. writes an `ObjectEvent` recording that the occurrence was completed,
   including which date it was for;
2. advances `dueDate` by `recurrenceDays`.

Both happen in one transaction.

How "next" is computed (proposed, to confirm during implementation):
step forward from the **current due date**, not from "today". If that
result is still in the past (the item was very overdue), keep stepping
until it lands on or after today, so completing a long-overdue item never
leaves it immediately overdue again. Completing early, before the due
date, still advances from the due date, so the schedule doesn't drift.

The person can also just edit the date or the interval directly. That is
an ordinary field change, logged as `FIELD_CHANGED` like today, not a
completion.

### 6. History through the event log

Each completion is an `ObjectEvent`. This probably needs a new
`ObjectEventType`, e.g. `RECURRENCE_COMPLETED`, rather than overloading
`FIELD_CHANGED`, so History, Recent Activity and KD-052's significance
scoring can tell "completed this occurrence" apart from "moved the date".
`oldValue` / `newValue` carry the completed date and the new due date.

### 7. Calendar: future occurrences computed, not stored

Without extra work the calendar would only show the current `dueDate`, so
only the next occurrence. Instead, `lib/data/calendar.ts` projects the
upcoming occurrences on the fly (`dueDate + k × recurrenceDays`) for
whatever range is being viewed. Nothing is persisted for them. Projected
occurrences are display-only: clicking one goes to the object, and only the
current occurrence carries a reminder entry.

### 8. Upcoming & Due and Needs Attention: unchanged actions

These surfaces keep exactly the actions a custom item has today (see
`components/dashboard/ReminderList.tsx` `UpcomingActions` and
`NeedsAttentionCard`):

* **Edit** goes to the object page, where the person can change the date
  or interval, or use the complete-occurrence check (Decision 5).
* **Dismiss** dismisses **that occurrence only**. This already falls out of
  the existing design: the dismissal key includes the deadline
  (`dismissalKey("custom", id, type, dueDate)` in `lib/data/upcoming.ts` and
  `lib/data/attention.ts`), so once the due date advances, the next
  occurrence has a new key and shows up again.

Check during implementation that the notification read, first-seen and
push records (`NotificationRead` / `NotificationFirstSeen` /
`NotificationPushed`) are also keyed per deadline, so a new occurrence
re-notifies rather than being treated as already seen.

## Guardrails

* All KD-035 / KD-038 template guardrails apply unchanged: the usage lock
  on removal, no type-dropdown path, and labels carrying no meaning.
* Switching a template between Due Date and Recurring Due Date while it is
  in use is not allowed. It is a removal plus an add, and removal is
  already blocked by KD-035 Decision 7.
* `recurrenceDays` must be a positive integer, validated server-side, and
  needs a sensible upper bound in line with ADR-015's field limits.
* Completing an occurrence is idempotent against double-clicks and stale
  tabs: it only advances if `dueDate` still equals the occurrence the
  client saw (the same optimistic-concurrency pattern as BUG-007).

## Open Questions

* Is a day count enough for v1, or do people want "monthly" / "yearly",
  which aren't a fixed number of days? This ticket assumes days only, as
  asked.
* Should the completion check be offered directly on Upcoming & Due /
  Needs Attention later? It's deliberately out for now (Decision 8).
* Can a completion be undone (moving the date back and logging a reopen
  event), mirroring `TODO_REOPENED` / `GOAL_MILESTONE_REOPENED`?
* How far ahead the calendar projects (Decision 7): only the visible range,
  or a cap such as 12 months.
* Archiving an item: does it simply stop recurring? (Expected: yes, since
  archived items are already excluded everywhere.)

## Related

* KD-038 / ADR-011: the Due Date template field this sits beside and
  mirrors.
* KD-035: Module Templates (Decision 3 host restriction, Decision 7 usage
  gate).
* KD-006: Reminder and Recurring Reminder Field. The broader idea; this
  ticket covers the Custom Item / template slice of it.
* KD-048: Object Event Model, where occurrence history lives.
* KD-052: event significance. The new completion event needs a row in its
  significance table.
* KD-014: Kinesis Calendar.
* ADR-010: Notification and Reminders Awareness Surfaces.
