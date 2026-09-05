# ADR-009: Universal Quick Capture 

## Status

Accepted

## Context

Kinesis stores the administrator sides of things for a person's life. Therefore capturing should be easy and efforless.
Kinesis manages the administrative side of a person's life. For that to work, capturing something that needs attention must be quick and effortless.

Currently, creating an object in Kinesis is slower than writing a note or adding a reminder in a conventional app. This creates an important product problem: if things are not captured, the Dashboard is empty; if the Dashboard is empty, Kinesis's awareness layer has nothing to work with.

A user therefore needs to be able to capture something that requires action even when they do not yet know how to organise it, what Module it belongs to, or what structured Object should represent it.

Where possible, Kinesis should still encourage structured information.

For example, instead of creating:

> Remember to update my Somalian passport details with new one 

the better long-term representation may be:

- `Passport Somalia` as a Document Object
- the appropriate expiry or other relevant date stored on that Object
- a Reminder configured against the expiry or similar 
- Kinesis surfacing the Document through Notifications, Upcoming & Due, Expiring Soon, or other appropriate awareness surfaces

This is the richer representation because Kinesis understands what the thing actually is and therefore, can provide useful behaviour around it. For example, a notification will show up, and clicking on it will take you to that Passport page from which you could easily update the details. 

However, users will not always do this.

Sometimes they simply cannot be bothered to organise something at the moment they remember it. More importantly, Kinesis is explicitly intended to reduce cognitive load for people who may have attention difficulties, ADHD, stress, or other circumstances that make organisation difficult. It would therefore be unrealistic to expect good organisation as a prerequisite for using the system designed to help with disorganisation.

If capture requires too much effort, users will fall back to Reminders, Notes, Calendar, or another disconnected tool. The information then never reaches Kinesis, and Kinesis loses the opportunity to help. And we should always help. 

Kinesis should therefore meet the user halfway by supporting a lightweight standalone To-Do.

A To-Do is not intended to replace structured Objects, Reminders, dates, or Custom Fields. It represents a different concept: an action that needs to be performed.

## Decision

Kinesis will support standalone To-Do Objects.

The key architectural principle is:

> **To-Do are actionable items, but everything actionable is not a To-Do.**

A To-Do exists only when there is a genuine action that the user wants to record as an independent thing.

## Object versus action

Your passport and your task describe fundamentally different things:

| Record                             | Meaning                                          | Lifecycle                       |
| ---------------------------------- | -------------------------------------------------| --------------------------------|
| **Passport Somalia**               | A real-world entity Kinesis knows about          | Exists until deleted            |
| **Update my new passport details** | A temporary action concerning that entity        | Pending → completed             |
| **Reminder**                       | When Kinesis should remind you of "due date"     | Scheduled → triggered           |
| **Custom field**                   | A fact or property about the passport            | Updated when the fact changes   |

So this relationship is entirely valid:

```text
To-Do: Update my new passport details
        │ concerns
        ▼
Document: Passport Somalia
```

Technically this is Object-to-Object linking. That is not a flaw. Relationships between meaningful Objects are part of the core Kinesis architecture.

A Person can own a Document. A Goal can be supported by another Goal. A To-Do can concern a Document, Person, Goal, Finance Item, or any other suitable Object. A To-Do could add a action layer across those structures.

In future we might take this even further by introducing board-style view for To-Dos, where actions can move between meaningful states. For life-admin-specific groupings, perhaps it would be like:  

```text
I need to do
→ Someone else 
→ A future date
→ Scheduled
→ Done
```


However, it should reflect how personal administration actually works rather than copying a traditional project-management workflow. So that it becomes: 

I have the ball
→ Someone else has the ball
→ Time/Kinesis has the ball
→ I have the ball again
→ Done

It should ask, "Who has the ball". 

If the ball is with someone else, time dependant etc the To-Do should leave the user's active workload until a response is expected.
When the next action becomes theirs again, Kinesis returns it to their attention.

This reflects a broader product principle:
Kinesis should hold onto life-admin so the user does not have to hold all of it in their head.

This should not turn Kinesis into general-purpose project management system, it should be designed specifically around the realities of personal life administration. On that note, even turning a reminder into a to-do is not a bad idea at all and maybe considered later. 


## Why a To-Do cannot always be replaced by a custom field or Reminder

Consider a Passport that has been stolen.

The Passport remains a meaningful Object because Kinesis still needs to know about it and preserve its history. But several temporary actions may now exist:

```text
Passport Somalia
    ├── Call police about stolen passport
    ├── Obtain police report
    ├── Apply for replacement passport
    └── Update Kinesis when replacement arrives
```

Trying to represent these as Custom Fields would produce nonsense such as:

```text
Reminder/Date field: Call cops because passport was stolen
Value: ??? 
```

A Reminder alone is also insufficient. A Reminder answers:

> **When should Kinesis bring something to my attention?**

A To-Do answers:

> **What do I need to do?**

Those are related but different concepts.

The resulting relationships can also become useful naturally. For example: Sometimes to renew a official document due to it being stolen, a police report is required.

```text
To-Do: Apply for replacement passport
        │
        ├── related to → Passport Somalia
        └── depends/waiting on → Police Report 
```

The user does not have to model all of this immediately. They may initially capture only:

```text
Apply for new passport
```

and organise or link it later.

That is intentional.

## What modules are still for

Modules answer what kind of information you are exploring:

* Documents: what documents do I have?
* Goals: what am I working toward?
* People: who matters and how are we connected?
* Finance: what do I own, owe, earn and spend?
* Health: what is going on with my health ? 

The action view answers a completely different question:

> Across all those areas, what needs my attention now?

Without modules, Kinesis becomes a flat task manager. Without the action view, Kinesis becomes a beautifully organised filing cabinet that politely waits for you to remember to open the correct drawer. But right now, if you don't remember, it will, and that is the point.
















