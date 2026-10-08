# KD-055 — Recurring Due Date as a Template Field

**Status:** In Progress
**Priority:** Medium
**Tags:** Data Model, UX / UI, Improvement

## Summary

A Custom Item template can offer a **Recurring Due Date** as an alternative
to the existing Due Date field (KD-038). An object under that template has
one due date that repeats on a fixed rule ("every month", "every 90
days"). Completing the current occurrence moves the same object's due date
forward to the next one. The reminder surfaces (Needs Attention, the bell,
Upcoming & Due, the calendar) follow that date exactly as they already
follow an ordinary due date.

```text
Template: Car Service
  Fields
  - Garage (Text)
  - Next service due (↻ Recurring due date)  ← picked from the type dropdown

Object: Service the Golf
  Recurring due date   12 Nov 2026   Every year   [✓]
                                                  │
  click ✓ ────────────────────────────────────────┘
    → ObjectEvent logged: occurrence of 12 Nov 2026 completed
    → dueDate becomes 12 Nov 2027
    → same object, same links, fields and notes
```

## Scope

**In:** Custom Item templates only, for the same reason as KD-038: KD-035
Decision 3 means Custom Item is the only object type that can follow a
template.

**Out:**

* System modules (Document, Goal, Relationship, Finance, Person). The same
  exclusion-by-construction as KD-038 / ADR-011.
* Any repeat rule other than the five in Decision 3: no "every 3 months",
  no "every N weeks", no weekday or position rules ("first Monday of the
  month", "every weekday"). "Every N days" is the escape hatch for anything
  odd.
* Undoing a completion (Decision 5).
* A completion action anywhere other than the object page (Decision 8).
* KD-006's general "reminder on any object" feature. This ticket is the
  narrower Custom Item version; see **Related**.

## Decisions

### 1. A type-dropdown option, like Due Date today

There is no separate button. "**↻ Recurring due date**" is an option in a
field row's type dropdown, next to "◷ Due date". It follows exactly the rules
`TemplateFieldsEditor` already applies to Due Date (KD-038, as revised by
KD-040):

* **Only on a new, not-yet-saved row.** Choosing it there converts nothing,
  because the row has no earlier type. An existing, saved field's dropdown
  never offers it, so no field can ever be converted into or out of a
  recurring due date.
* **Only while the template has neither kind.** Once a template has a Due
  date *or* a Recurring due date field, new rows offer neither option.
* **Locked once saved.** That row's dropdown becomes the same disabled,
  greyed-out, single-option control a saved Due date gets
  (`disabled:bg-zinc-100`), unconditionally and not just once the template
  is in use. There is no explanatory text under the row. Hovering the
  disabled dropdown shows a tooltip: **"Only one due date type field is
  allowed"**. A disabled `<select>` doesn't fire hover events in every
  browser, so put the `title` on a wrapper element, not on the `<select>`
  itself. The label stays editable.

A template may have at most one of the two. As with KD-038 Decision 4,
this is enforced twice: the UI only offers the option when allowed, and
`updateTemplate` refuses a save that would end up with both, two of either,
or an existing field changing to or from a recurring due date. Add a
database backstop alongside KD-038's partial unique index, so that at most
one row per template is a due-date-like field.

### 2. Its own icon

A recurring due date field gets its own repeat icon: lucide `Repeat2`,
the same icon the calendar already uses for recurring items (Decision 7),
so "this repeats" looks the same everywhere. It must differ from the plain
due date's `Clock3`. In the native type dropdown the option is labelled
with a text glyph, "↻ Recurring due date", matching how "◷ Due date" and
"▤ Notes" are labelled today, since a `<select>` can't render an icon.
`Repeat2` itself appears next to the field's label and value on the object
page.

### 3. Filling it in: a date, and a repeat dropdown

On the object page (create and edit), the field asks:

1. **Date**: the next or current occurrence.
2. **Repeats**: a dropdown with exactly these options:

   | Option | Rule |
   |---|---|
   | Every week | +7 days |
   | Every fortnight | +14 days |
   | Every month | +1 calendar month (anchored, see below) |
   | Every year | +1 calendar year (anchored, see below) |
   | Every N days | +N days, where the person types N |

   Choosing **Every N days** shows a number input for N. The other options
   need no extra input.

**Why months and years are calendar units, not day counts.** Months and
years aren't a fixed number of days. "Every 30 days" for a monthly bill
drifts by roughly a week over a year, and "every 365 days" slips a day in a
leap year. So "Every month" and "Every year" step by calendar month and
calendar year, and "Every N days" covers anything that really is a fixed
number of days ("every 10 days", "every 90 days").

**Month arithmetic is anchored, and clamped to month end.** "Every month"
and "Every year" remember the day of the month the rule started on and
clamp to the last day of a shorter month: 31 Jan → 28 Feb → **31 Mar**, not
28 Mar. Without the anchor, one short month would permanently pull every
later occurrence back to the 28th. 29 Feb yearly works the same way: it
lands on 28 Feb in non-leap years and returns to 29 Feb in leap years.
Note that the existing practice cadence helper
(`lib/calendar/recurrence.ts`, `occurrencesForCadence`) matches months by
`getUTCDate() === anchor day` and so *skips* months that lack the 31st. This
feature must not reuse that behaviour. Build a small pure helper (e.g.
`lib/custom-modules/recurrence.ts`: `nextOccurrence` / `occurrencesInRange`)
with unit tests for the month-end and leap-year cases.

Both inputs are required together. A date with no repeat option, a repeat
option with no date, or "Every N days" with no N, is a validation error rather than a half-saved recurrence.

### 4. One row that moves, not a row per occurrence

The object keeps a single record, and its due date moves forward.

* The current occurrence lives in the existing `CustomItem.dueDate`, the
  same column KD-038 writes to. Needs Attention, notifications, Upcoming &
  Due and the calendar already read that column, so they pick up the
  current occurrence with no new reader.
* The rule is stored alongside it as new nullable columns, e.g.:
  * `recurrence RecurrenceRule?`, an enum
    `WEEKLY | FORTNIGHTLY | MONTHLY | YEARLY | EVERY_N_DAYS`;
  * `recurrenceDays Int?`, set only for `EVERY_N_DAYS`;
  * `recurrenceAnchorDay Int?`, the day of month, set only for `MONTHLY` /
    `YEARLY` (for the clamping in Decision 3).

  These are set only when the item's template has a recurring due date
  field. Check constraints enforce that `recurrenceDays` is present exactly
  when the rule is `EVERY_N_DAYS`, and the anchor exactly when it is
  `MONTHLY` / `YEARLY`.
* Past occurrences are **not** rows. They live in the `ObjectEvent` stream
  (see Decision 6), so links, fields and notes all stay on one object.

### 5. What moves the date forward: a complete-occurrence check

A check-box-style action sits next to the recurring due date on the
object page. Clicking it:

1. writes an `ObjectEvent` recording that the occurrence was completed,
   including which date it was for;
2. advances `dueDate` to the next occurrence under the rule (Decision 3).

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
  display-only, carry no reminder pin, and link to the object.
* **Every recurring entry shows the repeat icon.** The current occurrence
  and every projected one are marked `recurring: true`. The calendar
  already renders that flag as a `Repeat2` icon on the item pill and
  "· Recurring" in the item preview (`app/(app)/calendar/CalendarView.tsx`),
  exactly as it does for yearly important dates and relationship practices.
  So no new calendar styling is needed, only setting the flag. The current
  occurrence's reminder pin stays a plain reminder (bell icon): it is a
  one-off lead-up, not a repeating entry.
* **Dated or Scheduled follows the existing rule.** As with any custom item
  due date today, an occurrence is Scheduled if its due date carries a
  time, and Dated otherwise. Projected occurrences inherit the same time.
* **Jump straight to the window, then cap.** The calendar's only caller
  today passes a 42-day month grid (`app/(app)/calendar/page.tsx`), so even
  an "every 1 day" rule yields at most 42 occurrences. That makes the
  output size a non-issue. The real risk is the walk *to* the window:
  `?month=` accepts any year up to 9999, so stepping one occurrence at a
  time from a 2026 due date to that month would be millions of iterations.
  So the helper:
  1. computes the first occurrence on or after the window start directly
     (week / fortnight / N days: `ceil((start − dueDate) / stepDays)` steps in one go;
     month / year: from the month difference, then clamp per Decision 3);
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

## Progress

### Part 1: template field (done)

Decisions 1 and 2, built:

* **Schema.** `TemplateField.isRecurringDueDate` (boolean beside
  `type: DATE`, the same shape as KD-038's `isDueDate`; migration
  `20261022000000_template_recurring_due_date`). Database backstops in the
  migration's raw SQL: a check constraint pinning it to `DATE`, a check
  constraint refusing a row with both flags, and KD-038's isDueDate-only
  partial unique index replaced by one covering either flag, so a template
  has at most one due-date-type field.
* **`updateTemplate`** refuses converting an existing field into or out of
  the recurring kind (unconditionally, like Due Date), and refuses a save
  with two due-date-type fields of any mix, or one row claiming both:
  "Only one due date type field is allowed."
* **`parseTemplateFields`** reads `isRecurringDueDate` defensively and
  forces the field's type to `DATE`, as it does for Due Date.
* **`cloneTemplate`** copies the flag.
* **Editor** (`TemplateFieldsEditor`): "↻ Recurring due date" is a
  type-dropdown option on a new, unsaved row only, offered only while the
  template has no due-date-type field. Once saved, the row's dropdown is
  locked and greyed out. Hovering it shows "Only one due date type field
  is allowed". That tooltip now also applies to a saved Due date row, and
  sits on a wrapper element rather than the disabled `<select>`.

Not yet built (the object side, Decisions 3 to 9): until it is, a recurring
due date field on an object behaves as an ordinary date field, stored as an
`ObjectField` value and not in `CustomItem.dueDate`, with no repeat rule.
Don't ship a release from this branch until the object side lands.

## Guardrails

* All KD-035 / KD-038 template guardrails apply unchanged: the usage lock
  on removal, no type-dropdown path, and labels carrying no meaning.
* Switching a template between Due Date and Recurring Due Date while it is
  in use is not allowed. It is a removal plus an add, and removal is
  already blocked by KD-035 Decision 7.
* The repeat option is validated server-side against the enum.
  `recurrenceDays` must be a positive whole number with an upper bound in
  line with ADR-015's field limits (e.g. 1 to 999).
* Completing an occurrence is idempotent against double-clicks and stale
  tabs: it only advances if `dueDate` still equals the occurrence the
  client saw (the same optimistic-concurrency pattern as BUG-007).

## Open Questions

None blocking. Settled during review:

* Day count vs. calendar units → a dropdown of Every week / fortnight /
  month / year, plus Every N days (Decision 3).
* Completion check on Upcoming & Due / Needs Attention → no (Decision 8).
* Undoing a completion → no, edit the date instead (Decision 5).
* Calendar horizon → the visible range, from the current due date
  forward, capped at 366 occurrences per item (Decision 7).
* Calendar icon → every recurring entry shows the `Repeat2` icon
  (Decision 7).
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
