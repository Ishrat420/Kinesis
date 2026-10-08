# KD-055 — Recurring Due Date as a Template Field

**Status:** Accepted
**Priority:** Medium
**Tags:** Data Model, UX / UI, Improvement

## Summary

A Custom Item template can offer a **Recurring Due Date** as an alternative
to the existing Due Date field (KD-038). An object under that template has
one due date that repeats on a fixed rule ("every 6 months", "every 90
days"). Completing the current occurrence moves the same object's due date
forward to the next one. The reminder surfaces (Needs Attention, the bell,
Upcoming & Due, the calendar) follow that date exactly as they already
follow an ordinary due date.

```text
Template: Car Service
  Fields
  - Garage (Text)
  - Recurring due date  ← its own action, its own "repeat" icon

Object: Service the Golf
  Recurring due date   12 Nov 2026   every 6 months   [✓]
                                                      │
  click ✓ ────────────────────────────────────────────┘
    → ObjectEvent logged: occurrence of 12 Nov 2026 completed
    → dueDate becomes 12 May 2027
    → same object, same links, fields and notes
```

## Scope

**In:** Custom Item templates only, for the same reason as KD-038: KD-035
Decision 3 means Custom Item is the only object type that can follow a
template.

**Out:**

* System modules (Document, Goal, Relationship, Finance, Person). The same
  exclusion-by-construction as KD-038 / ADR-011.
* Weekday- or position-based rules ("first Monday of the month", "every
  weekday"). See Decision 3 for why a number plus a unit covers v1.
* Undoing a completion (Decision 5).
* A completion action anywhere other than the object page (Decision 8).
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

### 3. Filling it in: a date, and "every N units"

On the object page (create and edit), the field asks:

1. **Date**: the next or current occurrence.
2. **Repeats every**: a positive whole number **and a unit**, one of
   **days / weeks / months / years**.

The UI offers quick presets (Weekly, Monthly, Every 3 months, Every 6
months, Yearly) that fill in the number and unit, plus a "Custom" option
that exposes both inputs.

**Why a unit and not just a day count.** Months and years aren't a fixed
number of days. "Every 30 days" for a monthly bill drifts by roughly a
week over a year, and "every 365 days" slips a day in a leap year. People
think in months and years for most real recurrences (rent, renewals,
servicing, check-ups). A number plus a unit keeps that exact, and days and
weeks still cover anything odd ("every 10 days"). It is also what most
calendar and task apps offer in their custom repeat option. Weekday rules
("first Monday") are a different shape and stay out of scope until someone
needs them.

**Month arithmetic is anchored, and clamped to month end.** A monthly or
yearly rule remembers the day of the month it started on and clamps to the
last day of a shorter month: 31 Jan → 28 Feb → **31 Mar**, not 28 Mar. Without
the anchor, one short month would permanently pull every later occurrence
back to the 28th. Note that the existing practice cadence helper
(`lib/calendar/recurrence.ts`, `occurrencesForCadence`) matches months by
`getUTCDate() === anchor day` and so *skips* months that lack the 31st. This
feature must not reuse that behaviour. Build a small pure helper (e.g.
`lib/custom-modules/recurrence.ts`: `nextOccurrence` / `occurrencesInRange`)
with unit tests for the month-end and leap-year cases.

Both inputs are required together. A date with no rule, or a rule with no
date, is a validation error rather than a half-saved recurrence.

### 4. One row that moves, not a row per occurrence

The object keeps a single record, and its due date moves forward.

* The current occurrence lives in the existing `CustomItem.dueDate`, the
  same column KD-038 writes to. Needs Attention, notifications, Upcoming &
  Due and the calendar already read that column, so they pick up the
  current occurrence with no new reader.
* The rule is stored alongside it as new nullable columns, e.g.
  `recurrenceInterval Int?` and `recurrenceUnit RecurrenceUnit?`
  (`DAY | WEEK | MONTH | YEAR`), plus the anchor day of month
  (`recurrenceAnchorDay Int?`) for the clamping in Decision 3. All three are
  set only when the item's template has a recurring due date field, and are
  set or cleared together. A check constraint should enforce that.
* Past occurrences are **not** rows. They live in the `ObjectEvent` stream
  (see Decision 6), so links, fields and notes all stay on one object.

### 5. What moves the date forward: a complete-occurrence check

A check-box-style action sits next to the recurring due date on the
object page. Clicking it:

1. writes an `ObjectEvent` recording that the occurrence was completed,
   including which date it was for;
2. advances `dueDate` to the next occurrence under the rule.

Both happen in one transaction.

How "next" is computed: step forward from the **current due date**, not
from "today". If that result is still in the past (the item was very
overdue), keep stepping until it lands on or after today, so completing a
long-overdue item never leaves it immediately overdue again. Completing
early, before the due date, still advances from the due date, so the
schedule doesn't drift.

**Completion cannot be undone.** If someone completes an occurrence by
mistake, they edit the date back on the object page. That is an ordinary
`FIELD_CHANGED`, and the completion event stays in History as what actually
happened. There is no reopen event type.

Editing the date or the rule directly is always allowed, and is logged as
`FIELD_CHANGED` like today, not as a completion.

### 6. History through the event log

Each completion is an `ObjectEvent`. This needs a new `ObjectEventType`,
e.g. `RECURRENCE_COMPLETED`, rather than overloading `FIELD_CHANGED`, so
History, Recent Activity and KD-052's significance scoring can tell
"completed this occurrence" apart from "moved the date". `oldValue` /
`newValue` carry the completed date and the new due date.

### 7. Calendar: future occurrences computed for the visible range

Without extra work the calendar would only show the current `dueDate`, so
only the next occurrence. Instead, `getCalendarItems(start, end)` in
`lib/data/calendar.ts` projects every occurrence of the rule that falls
inside the range being viewed, starting from the current `dueDate`. Nothing
is persisted for them.

This is the usual practice: calendar apps store the rule, not the
instances, and expand it only for the window on screen. Kinesis already
works this way for yearly important dates (`occurrencesInRange` in
`lib/relationships/occurrence.ts`) and relationship practices
(`occurrencesForCadence`). The calendar page already passes just the month
grid's range (`app/(app)/calendar/page.tsx`), so there is no separate
"how far ahead" setting. Paging to any future month shows that month's
occurrences, however far out.

Details:

* **Only forward from the current `dueDate`.** Projected occurrences are
  never drawn *before* it. Past occurrences are history (Decision 6), not
  projections, and drawing them would claim they happened on schedule when
  they may not have.
* **The current occurrence is the real one.** It keeps today's due pin and
  reminder pin (`custom-due-*` / `custom-reminder-*`). Projected ones are
  display-only (marked `recurring: true`, like practices), carry no reminder
  pin, and link to the object.
* **Jump straight to the window, then cap.** The calendar's only caller
  today passes a 42-day month grid (`app/(app)/calendar/page.tsx`), so even
  an "every 1 day" rule yields at most 42 occurrences. That makes the
  output size a non-issue. The real risk is the walk *to* the window:
  `?month=` accepts any year up to 9999, so stepping one occurrence at a
  time from a 2026 due date to that month would be millions of iterations.
  So the helper:
  1. computes the first occurrence on or after the window start directly
     (days/weeks: `ceil((start − dueDate) / interval)` steps in one go;
     months/years: from the month difference, then clamp per Decision 3);
  2. walks from there to the window end;
  3. stops at a hard cap of **366 occurrences per item per call**. That is
     one year of a daily rule, which is far above anything the month grid
     can show, but still a safe bound if a wider view (agenda, year) is
     ever added. The cap is a named constant with a unit test, not a magic
     number.

### 8. Upcoming & Due and Needs Attention: unchanged actions

These surfaces keep exactly the actions a custom item has today (see
`components/dashboard/ReminderList.tsx` `UpcomingActions` and
`NeedsAttentionCard`):

* **Edit** goes to the object page, where the person can change the date
  or rule, or use the complete-occurrence check (Decision 5).
* **Dismiss** dismisses **that occurrence only**. This already falls out of
  the existing design: the dismissal key includes the deadline
  (`dismissalKey("custom", id, type, dueDate)` in `lib/data/upcoming.ts` and
  `lib/data/attention.ts`), so once the due date advances, the next
  occurrence has a new key and shows up again.

**No completion check on these surfaces, now or later.** Completing is
deliberately a two-step act (open the object, then complete) so it can't be
mistaken for Dismiss. A one-click complete next to Dismiss would get used
as "make this go away", silently pushing the date forward and writing
completions into History that never really happened.

Check during implementation that the notification read, first-seen and
push records (`NotificationRead` / `NotificationFirstSeen` /
`NotificationPushed`) are also keyed per deadline, so a new occurrence
re-notifies rather than being treated as already seen.

### 9. Archiving pauses it; nothing else changes

How archiving works today, for any custom item: `toggleCustomItemArchivedAction`
(`app/(app)/custom-modules/actions.ts`) only flips `archived` and logs
`ITEM_ARCHIVED`. **`dueDate` is left exactly as it was.** Every surface
filters archived items out at the query: `getAttentionRecords`
(`lib/data/attention-items.ts`) does, and Needs Attention, Upcoming & Due and
the notification engine all read through it, and so does
`getCalendarItems`. So an archived item, even one with a future due date,
simply disappears from all of them. Restoring it brings it back with the
same stored date. If that date has passed in the meantime, it shows as
overdue straight away.

A recurring item follows the same rule, with no special handling:

* Archiving **pauses** it. The date and rule are kept, nothing advances,
  and no projected occurrences are drawn on the calendar.
* Restoring resumes it from the stored date. If that's now in the past, it
  shows as overdue. The person either completes it (Decision 5's catch-up
  stepping lands the next date on or after today) or edits the date.

There is no auto-advance while archived. Moving a date on a schedule no one
is watching would write History nobody acted on.

## Guardrails

* All KD-035 / KD-038 template guardrails apply unchanged: the usage lock
  on removal, no type-dropdown path, and labels carrying no meaning.
* Switching a template between Due Date and Recurring Due Date while it is
  in use is not allowed. It is a removal plus an add, and removal is
  already blocked by KD-035 Decision 7.
* `recurrenceInterval` must be a positive integer, validated server-side,
  with an upper bound in line with ADR-015's field limits (e.g. ≤ 999).
  `recurrenceUnit` is validated against the enum.
* Completing an occurrence is idempotent against double-clicks and stale
  tabs: it only advances if `dueDate` still equals the occurrence the
  client saw (the same optimistic-concurrency pattern as BUG-007).

## Open Questions

None blocking. Settled during review:

* Day count vs. calendar units → number plus a unit (Decision 3).
* Completion check on Upcoming & Due / Needs Attention → no (Decision 8).
* Undoing a completion → no, edit the date instead (Decision 5).
* Calendar horizon → the visible range, from the current due date
  forward (Decision 7).
* Archiving → pauses it, same as any custom item today (Decision 9).

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
