# KD-056 — Recurring Due Dates on System Modules

**Status:** In Progress
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

### Other system modules

Not started. Candidates: Goal milestones.

## Related

* KD-055: Recurring Due Date for custom modules.
* Design mockup: "Recurring To-Do Design" artifact (To-dos as the example).
