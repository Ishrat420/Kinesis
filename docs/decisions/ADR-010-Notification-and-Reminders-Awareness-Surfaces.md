# ADR-010: Notification And Reminders Awareness Surfaces

## Status

Accepted

## Context

ADR-009 describes Kinesis as having an awareness layer: the person captures something, and Kinesis surfaces it back at the moment it matters. That layer is now nine surfaces: The notification bell, Upcoming & Due, Needs Attention, the calendar, the Expiring soon and Milestones widgets, the two "see all" pages behind them, and Goals at risk. Each was built when it was needed. In future we might provide greater customization through KD-005-customisable-module-widgets, so user is able to add/remove certain widgets as they see fit. 

Two different kinds of thing get drawn on those surfaces.

The first is a **date stored on a record** — a document's expiry, a milestone's due date, a birthday, a goal's target. These are facts. They exist the moment the person types them, they can be read for any day past or future, and no background process is needed to know them.

The second is a **notice about that date** — the lead-up before it, the statement that it has passed etc. 

There is also a real asymmetry in the data that reads as inconsistency until it is clarified. A **due date** is the day a thing is due: due on the day, late the day after. An **expiry date** is the last day a thing is valid: valid on the day, expired the day after. That is not a modelling acciden, a passport is valid on its expiry date, and a milestone due today is due today. It produces two different cutoffs across the engine and Needs Attention, and without the distinction stated, every future reader will find them and assume one is a bug.

Documents carry a further difference. Their lead time lives on the record rather than in settings, and its options are calendar periods rather than day counts. That is deliberate. 

None of this is written anywhere including *In-app notifications* and *Reminders* toggles. The reasoning lives in code comments beside the individual exceptions, which means it can only be found by someone already looking at the line in question, and an exception explained only where it is implemented is an exception that gets re-litigated. Kinesis needs one place that states what each surface is for, what each switch governs, which behaviours are deliberate exceptions and why, and what a violation of any of it looks like from the outside.


## Decision

Needs Attention uses < today consistently. Confirmed across all four: documents (expiryDate < today), milestones, custom items and to-dos (dueDate < today). No exceptions.

The card's own copy also explain it "Expired documents, and overdue milestones, to-dos and reminders". Something due today isn't overdue, so it shouldn't be there.

The bell does flip its type on the due date. Milestones, custom items and to-dos all switch at today >= dueDate.

The engine's document candidate only becomes EXPIRED when today > expiryDate, with the comment "A document remains valid for its full expiry date; it is expired the following day." So a document enters Needs Attention on precisely the day the bell calls it expired. 

The two date types mean different things:

A due date is the day the thing is due. Due on D, late on D+1.
An expiry date is the last day it's valid. Valid through D, expired on D+1.


remindersEnabled` sits differently. It is honoured by Upcoming & Due and by the calendar's reminder pins, and ignored by the Expiring soon and Milestones tiles and the two pages behind them. That split has never been argued, it is the shape the code grew into, which maybe revisited later on. 

### Documents 

1. Documents calculates reminders period from the form, shows up in **Expiring soon**, and in Upcoming & Due, bell/notification triggered, the reminder pin is visible on the calendar **before** the reminder period opens, months ahead.

2. Documents is expired, shows up in Needs attention, and in Upcoming & Due, bell/notification. It will be in the calendar also. It is never removed.

Deliberate exceptions, with the reason attached: 
- Documents calculates reminders period from the form instead of config. The reason for this is, configs are generalized. Document may need dedicated reminder per document. If a passport is useless six months out, honest warning is then around six or more months. It may change it future.
- The expiry pin is added on two pre-condition only: `if (document.expiryDate)`. An archived document keeps its details and history, but stops reminding you and leaves Needs Attention, Upcoming & Due and the calendar.
- Document candidate becomes EXPIRED when today > expiryDate, and this is what the bell and Upcoming & Due use. Your passport is technically valid on its expiry date. Valid through D, expired on D+1.
- KD-026 Will allow documents to have an option to have empty reminder. 

### Settings gates, Documents

|     | `In-app notification is not ticked` | `reminders is not ticked` | `archived` |
| --- | --- | --- |--- |
| Bell — `REMINDER_DUE` | blocks | blocks | blocked |
| Bell — `EXPIRED` | blocks | **survives** | blocked |
| Upcoming & Due — reminder | **survives** | blocks | blocked |
| Upcoming & Due — expired | **survives** | **survives** | blocked |
| Calendar reminder pin | **survives** | blocks | blocked |
| Calendar expiry pin | **survives** | **survives** | blocked |
| Expiring soon / stat tile | **survives** | **survives** | blocked |
| Needs attention | **survives** | **survives** | blocked |

### Milestones
1. Milestones enters reminders period based on the config, shows up in Milestones due within X day, and in Upcoming & Due, bell and notification sent, Reminder visible months ahead of the window opening. 

2. Milestones if it is over-due, shows up in Needs attention, and when due, in Upcoming & Due, bell/notification. It will be in the calendar in adance. As said, Needs attention is a day behind everything else.


Deliberate exceptions, with the reason attached: 
- The trigger for this is added on some pre-conditions: The milestone is not completed, The goal is active. **"goal not active" occurs `effectiveStatus(goal.status, goal.targetDate) !== "Active"` — in five situations:**
    - The goal was set to **Finished**, **Archived**, or **Revisit Later** by hand.
    - Its **target date passed** (which takes effect the moment it passes). 
    - There's also a third route into the *Completed* milestone column: recording a goal's current value auto-completes every milestone whose value it has reached.


###  Settings gates, Milestones

|  | In-app notification is not ticked | reminders is not ticked | Completed | Goal not active |
| --- | --- | --- | --- | --- |
| Bell — `REMINDER_DUE` (before due) | blocks | blocks | blocks | blocks |
| Bell — `MILESTONE_DUE` (overdue) | blocks | **survives** | blocks | blocks |
| Upcoming & Due — due soon | **survives** | blocks | blocks | blocks |
| Upcoming & Due — over its due date | **survives** | **survives** | blocks | blocks |
| Calendar reminder pin | **survives** | blocks | blocks | blocks |
| Calendar due-date pin | **survives** | **survives** | **survives**, relabelled `Completed milestone` | **survives**, relabelled `Unfinished milestone · goal no longer active` |
| Milestones due within (tile + page) | **survives** | **survives** | blocks | blocks |
| Needs attention | **survives** | **survives** | blocks | blocks |


### Custom item

1. Custom objects reminder period based on the config, shows up in Upcoming & Due, bell/notification triggered. Reminder pin is visible on the calendar 

2. Custom object is over-due, it shows up in Needs attention, and when it's due, it's in Upcoming & Due, bell/notification. It will be in the calendar also in advance. As said, Needs attention is a day behind everything else.

Deliberate exceptions, with the reason attached: 
- This is gated on `remindersEnabled` and not "Archived" to show up in Needs attention, and in Upcoming & Due unlike document

### Settings gates, Custom item

|  | `In-app notification is not ticked` | `remindersEnabled` | `archived` |
| --- | --- | --- | --- |
| Bell — `REMINDER_DUE` | blocks | blocks | blocks |
| Bell — `CUSTOM_ITEM_DUE` | blocks | **survives** | blocks |
| Upcoming & Due - reminder | **survives** | blocks | blocks |
| Upcoming & Due - due | **survives** | **survives** | blocks |
| Needs attention | **survives** | **survives** | blocks |
| Calendar due pin | **survives** | **survives** | blocks |
| Calendar reminder pin | **survives** | blocks | blocks |


### To-do

2. To-do if it's over-due, shows up in Needs attention, and when due it is in Upcoming & Due, bell/notification. Calender will have it. As noted, Needs attention is a day behind everything else.


### Settings gates, To-do

|  | `In-app notification is not ticked` | `reminders is not ticked` | `Done` | 
| --- | --- | --- |--- |
| Bell — `TODO_DUE` | blocks | **survives** | blocks |
| Upcoming & Due — due / overdue | **survives** | **survives** | blocks |
| Calendar due-date pin | **survives** | **survives** | DONE to-do keeps its pin relabelled "Completed to-do". |
| Needs attention | **survives** | **survives** | blocks |


## Relationship important date

|  | `In-app notification is not ticked` | `reminders is not ticked` |
| --- | --- | --- |
| Bell — `REMINDER_DUE` | blocks | blocks |
| Upcoming & Due | **survives** | blocks |
| Calendar reminder pin | **survives** | blocks |
| Calendar date pin | **survives** | **survives** |
| Calendar practice (cadence) pin | **survives** | **survives** |


*Relationship important date has no terminal-state column, a yearly date rolls forward the moment it passes and a one-off simply stops having a next occurrence, so there's nothing to close. Worth saying so in a footnote, otherwise it reads as an oversight and someone will add a column that has no meaning.

*archive is a hide verb, complete is a finish verb. Archiving means hiding related information, removing the pin from calender makes sense in that context. Completing means "I did the work" the date it fell due/expired is still a fact, and the relabelled pin is the record. 
 
## Other Exceptions

1. **Relationship important dates are never overdue anywhere.** Deliberate and documented in `occurrence.ts` - They're the only reminder source absent from Needs Attention.

Justification: We have reminder config for this along with "Upcoming & Due". But birthdays should not be overdue and therefore not be in Needs Attention. 

------
2. **Custom DATE fields land on the calendar and nowhere else.** A field typed DATE gets a calendar pin but produces no notification, no Upcoming & Due row, and no Needs Attention row — even when labelled something like "Renewal date". Only the record's single `dueDate`/`expiryDate` drives reminders.

Justification: That is expected because a Date as a custom field is intended to be a property of an object. It's not automatically a reminder or due date even if named that way. Most objects already have a reminder and Expiry/Due date mechanism for it's intended purpose. 
We will however, show these general dates in the calendar because so user can see and track them from there, they can also see them when they open that particular object. But It should not have reminder mechanism to it.

------
3. **Goal target dates are calendar-only.** A goal past its target never reminds and is never overdue.

Justification: We will need more idea and thought to decide the exact direction. Current idea is, a goal target is self-imposed. Assumption is, nothing external happens when you miss it e.g. no fine, no invalid passport, no locked account. Milestones and to-dos are where the actionable pressure belongs, and they already have it. For reminder lead, the idea is to leave it out for now and wait for someone to want it. 

However, the target date already has function, goals get archived when it passes its target date. Downstream, that goal drops out of Goals at risk, its milestones stop appearing in Needs Attention, and their reminder pins vanish from the calendar.

Where it does appear: the calendar (a plain "{name} target" item, no reminder pin), and indirectly in Goals at risk via calculateGoalHealth, which takes targetDate as an input. Not in Upcoming & Due, not in notifications, not in Needs Attention.

The issue is the silent archive. If a date is consequential enough to change the record's state, it's consequential enough to mention. KD-028 is raised to consider a solution for this issue. 

------
4. **Finance dates are invisible.** `FinanceItem.startDate/endDate` appear on no surface at all.

Justification: For Finance, we have to decide the module's role before the dates. Right now Finance is a tracking module. In future there are substantial overhaul possiblities in finance, therefore, when we cross that bridge, we might add awareness as we need. 














