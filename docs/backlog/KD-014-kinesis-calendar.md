# KD-014 — Kinesis Calendar

**Status:** Accepted — Needs Planning
**Priority:** High
**Tags:** Integration, UX / UI

## Summary

Introduce a **Kinesis Calendar** that provides a single calendar view of dated and scheduled items across Kinesis.
It should be like, for example in a Month view, it will show a broad life overview, what is expiring, what reminders, what rituls etc. 
The challenge is that we don't want to turn it into a corp calendar, it should be useful and not overwelming. 

So I think monthly view is more appt so user can plan and see month to month agenda to calm their nerves. 

The calendar should surface relevant events automatically rather than requiring users to enter the same information again.

## Calendar Sources

Items may include:

* Goal milestones with due dates
* Relationship practices / rituals
* Document expiry and reminder dates
* Recurring reminders
* Important relationship dates
* Custom module objects with active date/reminder fields
* Other future scheduled Kinesis items

Selecting an event should allow the user to navigate directly to its source object.

## External Calendar Sync

Explore the ability to sync selected Kinesis calendar items with external calendar services such as:

* Google Calendar
* Apple Calendar
* Other calendar providers where practical

Users should have control over **what is synced**, rather than automatically exporting every Kinesis date.

## Principle

**Dates should exist once.**

The Kinesis Calendar is a **view over existing dated information**, not another place where users must maintain duplicate events.

External calendar integration should similarly extend Kinesis dates into the user's existing calendar workflow without requiring duplicate entry.

## Future Considerations

* Month / week / agenda views
* Recurring events
* Calendar filtering by module
* Calendar-specific notification preferences
* Two-way calendar sync
* Creating or editing Kinesis items from the calendar
* Dedicated Kinesis calendar feed/subscription
