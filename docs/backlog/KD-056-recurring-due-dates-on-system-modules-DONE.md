# KD-056 — Recurring Due Dates on System Modules

**Status:** Done
**Priority:** Medium
**Tags:** Data Model, UX / UI, Improvement

## Summary

Let a system module's due date repeat, the way a custom item's Recurring
Due Date does (KD-055). The person turns an ordinary due date into a
recurring one with a repeat button when creating the record.

Details to follow.

## Progress

### To-dos (done)

Built to the finalized design (repeat button attached to the Due field),
consistent with KD-055 throughout:

* **Schema.** `Todo.recurrence` / `recurrenceDays` / `recurrenceAnchorDay`,
  the same `RecurrenceRule` enum and NULL-safe check constraints as
  `CustomItem`, plus one more: a repeating to-do is never stored as Done
  (migration `20261024000000_todo_recurrence`). The rules themselves now
  live in one shared module, `lib/recurrence`, used by both.
* **Create and edit** (`AddTodoForm`, `TodoDetailsForm`): a square repeat
  button joined to the Due field (`components/todos/RepeatControls.tsx`).
  Disabled with no due date ("Pick a due date first"); pressed, it shows
  the Repeats dropdown, N for "Every N days", and "Next event". Clearing the
  date turns repeat off. Same validation messages as KD-055.
* **Completing.** Every "mark done" path (board checkbox, the dashboard's
  Complete, the edit form's status) goes through `updateTodoDetails`, which
  for a repeating to-do moves the due date to the next occurrence (caught
  up to today or later), keeps it open as To do, and records
  RECURRENCE_COMPLETED instead of TODO_COMPLETED. Conditioned on the shown
  due date, so a double click or stale tab gets a conflict rather than
  skipping an occurrence. The board shows the "Done. Next due …" snackbar.
* **Display.** Board rows show the rule with the repeat icon; the detail
  page's Due tile adds the rule and "Next event".
* **Editing rules.** Re-saving keeps a clamped anchor day; changing the rule
  or rescheduling re-anchors; changing the rule logs a "Repeats" change.
* **Calendar.** Occurrences projected for the visible range, all with the
  repeat icon; only the current one has a reminder pin.
* **Reminders and notifications.** Unchanged code: they read the to-do's
  open status and `dueDate`, so the owner's to-do reminder lead applies,
  and notification and dismissal keys include the deadline, so each new
  occurrence notifies afresh.

Verified with typecheck, lint, the unit and integration suites (15 new
integration tests: create, validation, completion from each path,
conflicts, catch-up, editing and re-anchoring, calendar, notifications,
database constraints), a full migration replay into an empty schema, and a
production build. Not yet clicked through in a browser.

### Goal milestones (done)

Same repeat button, Repeats options, validation, catch-up and History
event as To-dos, in the Goals module's violet. Design mockup: "Recurring
Milestone Design" artifact. On the "New milestone" form the Repeats
dropdown is narrow, aligned under the date field rather than full width.

Decisions specific to milestones:

1. **The goal's target date ends the repeat.** A milestone must already be
   due before the goal's target date, so occurrences stop there. Ticking
   the last occurrence before the target date completes the milestone for
   good. The form says "Repeats until <the day before the target date>",
   and a last occurrence reads "Last one before the target date".
2. **Progress counts a repeating milestone only once its last occurrence is
   done.** Until then it is open; the row shows "Done N times" for the work
   so far.
3. **No repeat for a milestone with a target value.** Those complete
   themselves when the goal's measured value reaches them, which doesn't
   fit repeating. The repeat button is disabled with the hover text "A
   milestone with a target value can't repeat".
4. **A goal with no target date:** the milestone repeats indefinitely and
   never counts toward progress. Accepted.

Missed occurrences behave as for To-dos: nothing moves on its own; the
milestone stays overdue until ticked, then catches up to the next
occurrence on or after today.

What shipped:

* **Schema.** `Milestone.recurrence` / `recurrenceDays` /
  `recurrenceAnchorDay` plus `completedOccurrences` ("Done N times"), with
  the same NULL-safe check constraints and one more: never a repeat
  alongside a target value (migration
  `20261025000000_milestone_recurrence`).
* **Forms.** The repeat button joins the milestone's date field
  (`DueDateField`'s new `addon`) on both the "New milestone" and edit
  forms; the Repeats fields sit narrow under the date
  (`useMilestoneRepeat` in `GoalAddForms.tsx`). The shared controls moved
  to `components/recurrence/RepeatControls.tsx` and take an accent (teal,
  violet) and a size. The button is disabled with "A milestone with a
  target value can't repeat" while a target value is entered.
* **Ticking** (`toggleMilestoneAction`, from the row, Upcoming & Due and
  Needs Attention, each passing the date it showed): moves the date to the
  next occurrence and counts it, recording RECURRENCE_COMPLETED on the goal
  with the milestone's name; when the next occurrence would land on or after
  the goal's target date it completes the milestone instead
  (GOAL_MILESTONE_COMPLETED, progress counts it). Snackbar on the row.
* **Editing.** Same anchor rules as To-dos; a rule change logs a "Repeats"
  milestone update; rescheduling re-anchors; removing the date removes the
  repeat; duplicating copies the rule with the count reset.
* **Row.** "↻ Every week · Done N times · Next event: …", or "Last one
  before the target date".
* **Calendar.** Occurrences projected up to the day before the goal's
  target date, with the repeat icon; only the current one has a reminder.
* **Reminders and notifications.** Unchanged code; they follow the moving
  due date on the owner's milestone lead.

Verified with typecheck, lint, the unit and integration suites (12 new
integration tests), a full migration replay into an empty schema, and a
production build. Not yet clicked through in a browser.

### Documents (done)

A document's expiry date *renews* rather than repeats, so the same control
speaks of renewing: the repeat button on the Expiry date, in Documents'
blue, with a "Renews…" dropdown and "Next expiry". Design mockup:
"Recurring Document Design" artifact.

Decisions specific to documents:

1. **"Mark renewed", not a tick box.** On the document page's Expiry tile.
   It moves the expiry to the next occurrence (caught up to today or later
   if it lapsed long ago, as for To-dos) and brings the stored status up to
   date in the same write.
2. **The issue date is left alone** when renewing.
3. **Nothing renews on its own.** An expired renewing document stays
   expired until it is marked renewed.
4. **Upcoming & Due is unchanged.** Edit and Dismiss stay; renewing happens
   on the document page. Dismissing hides that one expiry only, since
   notification and dismissal keys already include the expiry date.
5. **An archived document can't be renewed** ("Restore this document
   before renewing it.").

What shipped:

* **Schema.** `Document.recurrence` / `recurrenceDays` /
  `recurrenceAnchorDay`, with the same NULL-safe check constraints (a rule
  needs an expiry date), and a new History event type `DOCUMENT_RENEWED`
  (migration `20261026000000_document_recurrence`).
* **Forms** (create dialog and edit form, via `DocumentFields`): the repeat
  button joined to the Expiry date; the Renews fields under the Expiry
  column. Disabled with "Pick an expiry date first"; clearing the date turns
  renewing off. `RepeatControls` gained the blue accent and renew wording.
* **Renewing** (`renewDocument` / `renewDocumentAction`): conditioned on the
  expiry the page showed, so a double click or stale tab is refused as a
  conflict. Moves `updatedAt` on, so an edit opened before renewing must
  reload, and the page carries the new stamp so an Edit after renewing saves.
  Snackbar: "Renewed. Next expiry …".
* **Audit.** Renewing records DOCUMENT_RENEWED ("Renewed · Expiry moved from
  X to Y", high significance), not a status or field change. Turning
  renewing on, off or to another rule records a "Renews" field change
  (e.g. "Every month" to "Every year"). Editing keeps the anchor day on an
  unchanged re-save and re-anchors when the date or rule changes.
* **Display.** The Expiry tile shows "↻ Renews every year · Next expiry: …";
  the Documents list shows the rule beside the expiry date.
* **Calendar.** Future expiries projected with the repeat icon; only the
  current one has a reminder pin.

Verified with typecheck, lint, the unit and integration suites (11 new
integration tests, 2 unit tests), a full migration replay into an empty
schema, and a production build. Not yet clicked through in a browser.

### Finance and Relationships (out of scope)

Left as they are, by decision. Finance items already repeat through their
own frequency, start and end date; Relationships already repeat through
important dates ("repeats every year") and practice cadences. Neither moves
onto the shared repeat rules.

A goal's own target date doesn't repeat (one finish line; its milestones
carry the repeating work), and extra Date custom fields stay one-off
reference dates.

## Related

* KD-055: Recurring Due Date for custom modules.
* Design mockup: "Recurring To-Do Design" artifact (To-dos as the example).
