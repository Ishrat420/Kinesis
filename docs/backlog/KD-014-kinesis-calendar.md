# KD-014 — Kinesis Calendar

**Status:** Done
**Priority:** High
**Tags:** Integration, UX / UI

## Summary

Implement a dedicated **Kinesis Calendar** page that acts as a time-based overview of dated and scheduled information already stored elsewhere in Kinesis.

The Calendar should not behave like a corporate meeting calendar or hourly planner.

Its main purpose is:

> Show the user what is coming up across their life in readable monthly view.

The Calendar should help users see upcoming expiries, reminders, milestones, relationship practices, important dates, and intentionally scheduled actions without requiring duplicate entry.

---

## Core Principle

Kinesis Calendar is a **view over existing Kinesis data**.

Dates should continue to belong to their source objects.

Examples:

```text
Passport
Expiry Date: 19 Aug 2026
```

```text
Goal Milestone
Reach $50,000
Due Date: 12 Aug 2026
```

```text
Relationship Practice
Date Night
Every Friday
```

The Calendar should surface these automatically.

Do not create duplicate calendar records simply because something needs to appear on the Calendar.

---

# Primary View

Implement **Month View** as the primary Calendar experience.

Do not implement an hourly week/day planner for this MVP.

The Month View should use most of the available desktop content width.

Each day cell must be large enough to show multiple items directly.

Example:

```text
┌─────────────────────────────┐
│ 19                          │
│                             │
│ Passport expires            │
│ House milestone due         │
│                             │
│ 
│                             │
│ 7:00 PM Date night          │
└─────────────────────────────┘
```

The user should be able to understand a meaningful amount of their month without opening every day individually.

---

# Calendar Header

Provide a header similar to:

```text
Calendar

‹                    August 2026                    ›

                         Today

[ Month ] [ Agenda ]                    [ Filters ]
```

For MVP:

* Month view should be fully implemented.
* Agenda can be implemented as a simple secondary view if practical.
* `Today` returns to the current month.
* Previous/Next arrows move between months.

The currently selected month should remain preserved when navigating to another Kinesis object and returning to the Calendar where practical.

---

# Two Main Calendar Item Types

The Calendar must distinguish between:

## 1. Dated Items

A dated item means:

> Something is important on or around this date.

It does **not** imply the user has blocked time to do something.

Examples:

* Passport expiry
* Milestone due date
* Insurance renewal
* Birthday
* Reminder
* Important relationship date
* Vehicle registration expiry

Example:

```text
Passport expires
19 Aug
```

No start/end time is required.

---

## 2. Scheduled Items

A scheduled item means:

> The user has intentionally planned an action or event for a specific date/time.

Examples:

```text
Date night
21 Aug · 7:00 PM
```

Scheduled items may eventually be synced to external calendar providers.

---

# Visual Difference

Dated and Scheduled items must have **different visual treatments**. And it includes color difference too.

For example:

### Dated

* softer background
* no time shown
* compact presentation

### Scheduled

* explicit time where available
* clock/calendar icon


The primary semantic distinction should remain:

```text
Dated
vs
Scheduled
```

Module/source can be shown using subtle icons or metadata.

---

# Initial Data Sources

The Calendar should be able to normalize and display data from:

### Goals

* Milestone due dates
* Goal target dates 


### Documents

* Expiry dates
* Reminder dates

### Relationships

* Important dates
* Connection practices / rituals
* Recurring relationship reminders

### Custom Modules

* Object dates that are explicitly configured as reminders or calendar-relevant dates

---

# Normalized Frontend Shape

Create a common internal calendar representation so the Calendar UI does not need to understand every module schema directly.

For example:

```ts
type KinesisCalendarItem = {
  id: string;
  title: string;

  kind: "DATED" | "SCHEDULED";

  date: Date;

  startTime?: string;
  endTime?: string;

  sourceType:
    | "GOAL"
    | "MILESTONE"
    | "DOCUMENT"
    | "RELATIONSHIP"
    | "REMINDER"
    | "CUSTOM_OBJECT";

  sourceObjectId: string;

  sourceModule?: string;

  priority?: "HIGH" | "MEDIUM" | "LOW";

  recurring?: boolean;

  icon?: string;
};
```

This is a normalized **view model**, 

---

# Month Grid

The Month View should display:

* Seven columns
* Monday to Sunday
* Standard month navigation
* Previous/next month overflow dates shown subtly if needed
* Large day cells
* Multiple items per day

Each item should appear as a compact clickable row/pill inside the day.


If there are too many items for the available cell height:

```text
+3 more
```

Clicking `+3 more` should open the Day Overview.

Do not allow a busy day to make the entire month grid excessively tall.

---

# Item Interaction

Every Calendar item must be clickable.

Clicking an item should first open a small **contextual preview/popover** rather than immediately navigating away.

---


# Recurring Items

Recurring relationship practices and recurring reminders should appear in the relevant dates within the requested Calendar range.

Do not persist a separate database row for every future occurrence.

Use the recurrence definition to generate occurrences for the currently viewed month.

Example:

```text
Date Night
Every Friday
```

When viewing August, generate only the Fridays required for August.

Recurring routine items should have a Recurring icon to indicate it 

---

