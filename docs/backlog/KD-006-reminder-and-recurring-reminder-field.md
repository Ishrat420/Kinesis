# KD-006 — Reminder and Recurring Reminder Field

**Status:** Idea
**Priority:** High

## Summary

Extend the reminder system to support reminder and recurring reminders on any object.

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

## Consideration

* Decide if objects that already have an Reminder field by default, should be able to get another one? e.g. Documents etc. 

* Decide if objects that already have an dedicated Reminder config, should also be able to get Stadard reminder and recurring reminders? If so what is the use case for then keeping the config settings? e.g. Custom objects etc. 

## Notes

* Recurring reminders should use the shared Kinesis reminder and notification system.
* An object may have multiple recurring reminders.
* Users should be able to pause, edit, or remove a recurring reminder.
* Future custom recurrence rules can support patterns such as `Every 2 weeks` or `Every 3 months`.


