# BUG-004 — Calendar can never show a future reminder

**Status:** Fixed
**Priority:** Medium

## Problem

The Calendar's *Reminders* filter listed reminders as a source you could show or hide, alongside Documents, Milestones and the rest. That implied reminders were something you could see across time. They were not: tick only *Reminders*, page forward to next month, and the grid was empty every time, no matter how many reminders were queued up.

A reminder pin only ever appeared once the reminder had already gone off.

## Cause

`getCalendarItems` read reminders out of the `Notification` table.

`Notification` is not a schedule. It is a reconciled inbox of what should be alerting *now*: every `get*NotificationCandidate` returns `null` while `today < reminderAt`, and each reconciler deletes any row that no longer matches the current candidate. A row therefore exists only while its reminder is already open, so every stored `reminderAt` is in the past or today. The Calendar was asking a state store a question about time.

The same join carried a second fault: because a pin existed only if the engine had run, a reminder's presence on the Calendar depended on background-job timing. Changing a lead time in Settings changed nothing on the Calendar until the next reconcile.

## Fix

Reminder pins are derived, not read. A reminder date is a pure function of a deadline and a lead — `lib/calendar/reminders.ts` resolves it for any date, past or future, and `lib/data/calendar.ts` computes one per record from the rows it already loads. The notification join is gone.

Both the Calendar and the notification engine measure a lead through the same helpers, and `tests/unit/calendar-reminder-pins.test.ts` asserts the derived date equals the engine's own `reminderAt` for every source, so the pin and the moment the bell speaks cannot drift apart.

Specifics worth keeping in mind:

* **A pin's wording is built from its deadline, never from today.** A notification's `message` reads "expires in 30 days", which is true only on the day it was reconciled; a pin months out states the deadline as a date instead.
* **Documents keep their own lead.** A document's `prompt` names a calendar period (1 year / 6 months / 3 months) rather than the day count it is stored as, so it stays distinct from the day-based lead settings — flattening the two would move document pins around short months.
* **A yearly date is pinned at every occurrence in view**, not only the next one. Occurrences are gathered as far ahead as the lead reaches, so an occurrence just past the window can still open its lead-up inside it.
* **A pin is windowed on its own date**, which routinely falls in a different month from the deadline it warns about.
* **No pin without a reminder behind it.** Reminders switched off, notifications switched off, a completed milestone, or a milestone on a goal that is no longer active — each drops the pin, matching what the engine reconciles away.
* **Past pins persist.** Previously a reminder vanished from history the moment the engine deleted its row (a renewed document, a completed milestone). A derived pin stays where it happened.

## Interface

*Reminders* now defaults to **off**. Every dated record grows a second pin a lead time earlier, and a month cell renders three items before collapsing the rest into "+N more", so leaving them on would push the deadlines themselves out of view. The chip remains for anyone who wants the run-up, the filter panel explains what a reminder row is, and a pin is drawn in its own amber tone with a bell — a warning ahead of a thing, not the thing itself.

## Known gap, not addressed here

To-dos carry due dates and `TODO_DUE` notifications but appear nowhere on the Calendar — no due dates, no pins, and they are absent from the source filter. That is a separate piece of work.
