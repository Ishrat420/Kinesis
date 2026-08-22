# ADR-004 — Goals Module

## Status

Accepted

---

## Context

Goals will be implemented as a specialised Kinesis module built on the shared Object model, with optional capabilities for milestones, measurable targets, progress tracking, relationships, reminders, and deterministic goal-health calculations.

Goals represent what a user is intentionally moving toward.

Unlike tasks, goals may exist for months or years and vary enormously in complexity.

Examples include:

```text
Read more
Learn Japanese
Run 5 km
Deadlift 100 kg
Save $20,000
Buy a house
Change careers
Travel to Japan
```

Kinesis should not assume that every goal is a project, requires a deadline, has measurable progress, or can meaningfully be represented as a percentage.

At the same time, complex goals should be capable of becoming highly structured when that structure helps the user.

The Goals module therefore needs to support both extremely simple goals and long-term goals containing milestones, measurable targets, related objects, documents, reminders and calculated progress.

The guiding principle is:

> A goal starts simple and gains structure only when the user needs it.

## Decision

### Goals is a Specialised Module

Goals will use the shared Kinesis Object system but will provide specialised functionality that is meaningful specifically to goals.

Examples include:

* Goal statuses
* Milestones
* Measurable targets
* Goal progress
* Goal health
* Target dates
* Progress history

Goals therefore differs from a fully configurable module such as Health.

## Goal List

The Goals module will initially present goals using a list-based view consistent with other Kinesis modules.

Selecting a goal opens its dedicated Goal Detail experience.

The list should allow filtering by status and may later support additional views.

## Goal Status

Goals support the following statuses:

```text
Active
Revisit Later
Finished
Archived
```

### Active

The user is currently pursuing the goal.

### Revisit Later

The user intentionally does not want to actively pursue the goal at present but intends to reconsider it later.

A revisit date or reminder may optionally be associated with this status.

### Finished

The goal has been achieved or intentionally completed.

Completion history should be retained.

### Archived

The goal is no longer actively relevant but should remain available historically.

### Deleted

Deletion is separate from status.

Users may permanently delete goals.

Deletion should require deliberate confirmation where related milestones, files, activity or other data may also be affected.

## Goal Creation

Goal creation should have extremely low friction.

Initially, only the goal name is required.

```text
New Goal

Goal Name *
Target Date
Note

[Create Goal]
```

The user should not be asked to choose:

* Goal type
* Project complexity
* Progress methodology
* Financial vs non-financial
* Milestone structure
* Tracking method

These capabilities can be added after creation.

## Basic Goal Experience

Immediately after creation, a goal may contain nothing more than:

```text
Buy a house

Active

Target · Jun 2029
2 years 10 months remaining

A place that's ours.
```

If no target date is provided, the time-remaining field is simply absent.

A simple goal is considered valid and complete as a Kinesis object.

The user is never required to add milestones or measurable tracking.

## Progressive Complexity

Goals should become more sophisticated as capabilities are added.

Conceptually:

```text
Simple Goal
    │
    ├── + Target Date
    │
    ├── + Milestones
    │
    ├── + Measurable Target
    │
    ├── + Relationships
    │
    ├── + Files
    │
    └── + Reminders
```

Kinesis should show only functionality relevant to the structure the user has created.

A casual goal should remain visually simple.

A complex long-term goal may naturally become project-like without requiring the user to classify it as a project.

## Milestones

Goals may optionally contain milestones.

Milestones represent meaningful checkpoints toward achieving the goal.

They are not intended to be ordinary to-do items.

The conceptual distinction is:

> A task describes something to do.

> A milestone describes meaningful progress toward where the user wants to go.

Milestones represent the user's best current understanding of the path toward their goal.

They are expected to evolve as circumstances and understanding change.

### Adding Milestones

After creating a goal, the Goal Detail page provides:

```text
+ Add Milestones
```

The milestone experience should communicate that the user does not need to know the perfect path.

Suggested language:

> **How do you think you'll get there?**

> Break this goal into meaningful checkpoints. They don't need to be perfect — just the best path you can see right now.

Users can add, remove, edit and reorder milestones.

## Milestone Structure

A milestone may contain:

```text
Name
Target Date
Notes
Numeric Target Reference
```

Only the name is required.

Example:

```text
Buy a House

✓ Build emergency fund
✓ Open deposit account
→ Reach $50,000
○ Speak to mortgage broker
○ Get pre-approval
○ Begin property search
```

Kinesis may identify the first incomplete milestone as the current or next milestone.

## Milestone Progress

A goal may optionally display milestone progress.

The default calculation is:

```text
Completed Milestones / Total Milestones
```

For example:

```text
Milestone Progress

██████████────────────────────

1 of 3 milestones completed
33%
```

This percentage represents **milestone completion**, not necessarily the literal percentage of the overall goal achieved.

Milestones may differ significantly in difficulty, duration and importance.

Kinesis should therefore:

> 1 of 3 milestones complete.

The progress bar may be removed or hidden by the user.

## Measurable Targets

Goals may optionally have a measurable target.

The user-facing action should be:

```text
+ Add Measurable Target
```

rather than exposing implementation terminology such as "numeric tracking."

A measurable target defines a numeric quantity the user is working toward.

Examples include:

```text
$120,000
100 kg
20 books
5 km
10 clients
```

Conceptually:

```text
GoalMetric

Name
Unit
Starting Value
Current Value
Target Value
Source
```

Example:

```text
House Deposit

Current
$32,000

Target
$120,000
```

## Units

Measurable targets should support units rather than assuming all numeric goals are financial.

Examples include:

```text
AUD
USD
kg
km
books
hours
clients
%
custom unit
```

Currency should be treated as one form of measurable target rather than requiring a separate financial-goal architecture.

## Numeric Milestones

When a goal contains a measurable target, milestones may optionally reference values within that target.

For example:

```text
Goal
Save $120,000

Current
$32,000

Milestones

✓ Reach $10,000
✓ Reach $20,000
→ Reach $50,000
○ Reach $80,000
○ Reach $120,000
```

When the associated metric reaches or exceeds the milestone threshold, Kinesis may automatically complete the milestone or suggest completion.

The user should retain the ability to correct or undo automatic completion.

## Multiple Progress Indicators

Milestone progress and measurable progress are independent.

A goal may display either, both, or neither.

Example:

```text
Milestones

████████████████────────────────
2 of 5 complete
40%


House Deposit

██████████──────────────────────
$32,000 of $120,000
27%
```

Both pieces of information can remain independently meaningful.

## Metric History

Kinesis should retain historical values for measurable targets.

Conceptually:

```text
GoalMetricSnapshot

id
goalMetricId
value
recordedAt
source
```

Example:

```text
January     $35,000
February    $38,100
March       $40,700
April       $43,400
May         $46,500
```

Metric history enables progress trends, projections and Goal Health calculations.

Values may initially be entered manually.

Future integrations may provide values automatically.

For example:

```text
Source
Manual
```

may later become:

```text
Source
Linked Bank Account
```

The Goal system should not need to change based on where the measurement originates.

## Goal Health

Where sufficient deterministic information exists, Kinesis may calculate Goal Health.

Example states include:

```text
AHEAD
ON TRACK
AT RISK
```

Goal Health should initially be rule-based rather than AI-generated.

For a measurable goal with a target date, Kinesis may calculate:

```text
Remaining Amount
Required Pace
Actual Pace
Projected Value
Projected Completion Date
Variance From Target
```

Example:

```text
Goal
Save $120,000

Current
$46,500

Target Date
June 2029

Remaining
$73,500

Required Pace
~$2,160/month
```

Kinesis may then communicate:

```text
ON TRACK

You need to save approximately $2,160/month
to reach this goal.
```

If sufficient historical data exists:

```text
AT RISK

At your current trajectory, you're projected
to reach approximately $104,000 by June 2029.
```

or:

```text
AHEAD

At your current pace, you're approximately
4 months ahead.
```

Thresholds for Ahead, On Track and At Risk should be deterministic and configurable internally.

AI is not required for these calculations.

AI may later help explain the result or suggest actions, but the underlying status should come from known data and transparent calculations.

## Relationships

Goals participate in the universal Kinesis relationship system.

For example:

```text
Buy a House
│
├── House Deposit Account
├── Partner
├── Mortgage Documents
├── Home Buying Research
├── Mortgage Broker Task
└── Related Reminders
```

Related information should not be duplicated inside the Goal.

The Goal references existing objects.

For example, a savings balance already available through Finance may eventually become the source for a Goal's measurable target.

This supports the Kinesis principle:

> Enter information once and surface it wherever it is relevant.

## Files

Goals may have related files through the shared Object/File relationship system.

For example:

```text
Buy a House

Files
├── Broker Notes.pdf
├── Pre-Approval.pdf
└── Property Research.pdf
```

The same files remain available through the Documents module.

## Reminders

Goals and milestones may participate in the shared reminder system.

Examples include:

```text
Goal target approaching
Milestone target approaching
Revisit this goal
Review progress monthly
```

Reminders should use the central Kinesis reminder and notification infrastructure rather than implementing a Goals-specific notification system.

## AI Assistance

AI may later assist users in breaking down goals.

For example:

```text
Buy a house

+ Add Milestone
✨ Help me break this down
```

Kinesis may suggest:

```text
Build emergency fund
Set deposit target
Review borrowing capacity
Speak with mortgage broker
Obtain pre-approval
Begin property search
```

AI-generated milestones should initially be drafts.

The user can:

```text
Accept
Edit
Remove
Reorder
Reject
```

before they become part of the goal.

AI should assist the user's thinking rather than decide the correct path on their behalf.

## Goal Detail Experience

A structured Goal may eventually appear as:

```text
← Goals

Buy our first home                         Active

A place that's ours.

Target · June 2029
2 years 10 months remaining


HOUSE DEPOSIT

$46,500                              $120,000

████████████────────────────────────────

39%

ON TRACK
Maintain approximately $2,160/month
to reach your target.


MILESTONES

✓ Build emergency fund

✓ Open deposit account

→ Reach $50,000                       CURRENT
  $3,500 remaining

○ Speak with mortgage broker

○ Get pre-approval

○ Begin property search


RELATED

🏦 House Deposit Account
👤 Partner
📄 Home Buying Research
```

A simple goal should not display empty versions of these sections.

## Design Principles

### Start Simple

Creating a goal should require almost no configuration.

### Complexity Must Be Earned

Additional UI appears because the user added useful structure, not because Kinesis assumes every goal requires it.

### Goals Are Not Tasks

Tasks describe actions.

Goals describe outcomes or directions.

Milestones connect the two by describing meaningful checkpoints.

### The Path Can Change

Milestones represent the best path the user can see today.

Users should feel comfortable changing that path without feeling that the goal has failed.

### Measurement Is Optional

Not every meaningful human goal can or should be reduced to a number.

Kinesis should support qualitative goals without manufacturing artificial percentages.

### Use Deterministic Intelligence Where Possible

Progress, projections and Goal Health should be calculated using known data when possible.

AI should not be used merely because AI is available.

### Enter Information Once

Where another Kinesis object already contains relevant information, Goals should relate to or derive from that object rather than requiring duplicate entry.

### Empower, Don't Judge

Goal Health should provide useful information about trajectory without turning Kinesis into a system of guilt, streaks or productivity scores.

The purpose is to help the user understand where they are, where they are going, and what meaningful step comes next.

## Consequences

The Goals module will require specialised functionality beyond the generic configurable-module system.

However, it should continue using shared Kinesis infrastructure wherever possible, including:

* Universal Objects
* Relationships
* Files
* Reminders
* Notifications
* Custom and computed fields
* Activity history

Goals-specific infrastructure will primarily include:

* Milestones
* Measurable targets
* Metric history
* Progress calculations
* Goal Health
* Goal-specific presentation

This allows a Goal to remain as small as:

```text
Learn to sing confidently
```

or evolve naturally into a sophisticated long-term plan containing milestones, measurable progress, relationships, documents and projections.

Kinesis should not decide which goals deserve that complexity.

The user creates meaning and structure as they need it; Kinesis makes that structure useful.
