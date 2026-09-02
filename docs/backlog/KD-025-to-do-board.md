# KD-025 — To-Do Board: “Who Has the Ball?”

**Status:** Accepted — Needs Planning  
**Priority:** Medium  
**Tags:** UX/UI, Post-MVP

## Summary

Introduce a board/flow-style view for To-Do Objects based on a life-admin concept:

> **Who has the ball right now?**

Rather than copying a traditional project-management workflow such as:

```text
To Do → In Progress → Done
````

Kinesis should model where responsibility for the next movement currently sits.

Possible states:

```text
I have the ball
→ Someone else has the ball
→ Time/Kinesis has the ball
→ I have the ball again
→ Done
```

## Why

Life-admin tasks often involve handoffs rather than continuous work.

Examples:

```text
Submit passport application
→ Waiting on Passport Office
→ Response received
→ I need to provide another document
→ Done
```

```text
Follow up with landlord
→ Waiting on landlord
→ Waiting until Friday
→ Follow up
→ Done
```

A To-Do that is waiting on someone else or waiting for a future date should not continue occupying the user's active mental workload.

The core principle is:

> **Only keep something in the user's active attention when the next move is actually theirs.**

Kinesis should hold the rest and return it when action is required.

## Functional Direction

A To-Do may be in a state such as:

* **With me** — user currently needs to act
* **Waiting on someone** — another person or organisation has the next move
* **Waiting for time** — nothing useful can happen until a future date
* **Kinesis is watching** — Kinesis is monitoring a reminder/date/condition
* **Done**

Moving a To-Do between states should be lightweight.

Where appropriate, a handoff may capture:

* who/what it is waiting on
* expected response date
* return/follow-up date
* optional note

When the expected time arrives, Kinesis can return the To-Do to the user's active attention.

## Dashboard Integration

The model could support summaries such as:

```text
4 with you
7 waiting on others
3 coming later
11 Kinesis is watching
```

This is more useful than simply showing the user a large count of open tasks.

## History

State changes/handoffs may also generate meaningful history automatically:

```text
12 Sep — Submitted application
12 Sep — Waiting on Passport Office
28 Sep — Response expected
29 Sep — Followed up
03 Oct — Response received
04 Oct — Completed
```

This history may later contribute to Timeline without requiring the user to manually document each step.

## UX Direction

The board should be designed around personal administration, not generic project management.

Avoid importing concepts such as:

* sprints
* story points
* epics
* software-development workflow states
* highly configurable Jira-style status systems

The experience should remain lightweight and understandable without requiring the user to manage the workflow itself.

A future visual treatment could use columns, a relay/flow view, or another representation better suited to the handoff model.

## Architecture

The board is a **view over existing To-Do Objects**, not a separate task system.

No duplicate "board tasks" should be created.

Any state/handoff model should also remain compatible with linked Objects, Reminders, dates and future shared Kinesis capabilities.

## Out of Scope

* General-purpose project management
* Jira/Trello clone
* arbitrary workflow builders
* team collaboration/work assignment
* sprints or agile planning
* automatic AI workflow generation

## Principle

> **Kinesis should hold onto life-admin so the user does not have to hold all of it in their head.**

```

I’d keep **Priority Medium** because the To-Do/capture foundation itself matters more first; this becomes much more valuable once To-Dos actually exist and the unified action layer is working.
```
