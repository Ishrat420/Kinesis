# KD-006 — Recurring Reminder Field

**Status:** Idea
**Priority:** High

## Summary

Extend the reminder system to support recurring reminders on any object.

Users can configure a reminder to repeat automatically instead of representing a single date.

Initial recurrence options:

* Daily
* Weekly
* Monthly
* Yearly
* Custom interval

Example:

```text
Reminder
Dental Check-up

Repeats
Every 6 months

Next reminder
12 November 2026
```

Once a recurrence occurs, Kinesis calculates the next occurrence automatically.

## Notes

* Recurring reminders should use the shared Kinesis reminder and notification system.
* An object may have multiple recurring reminders.
* Users should be able to pause, edit, or remove a recurring reminder.
* Future custom recurrence rules can support patterns such as `Every 2 weeks` or `Every 3 months`.
