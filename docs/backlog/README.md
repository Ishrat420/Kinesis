# Kinesis Backlog

This directory contains planned, proposed, active, blocked, and completed development work for Kinesis. It also contains Bugs. 

The backlog acts as a lightweight ticketing system while Kinesis is under active development.

---

## Ticket Types

### KD — Kinesis Development Work Item

General Kinesis product and development work.

KD tickets may represent:

* Features
* Improvements
* UX work
* Infrastructure
* Refactoring
* Research
* Technical work

### BUG — Bug

Unexpected or incorrect behaviour in an existing implementation.

Bug tickets are stored under:

```text
backlog/bugs/
```

---

# Statuses

Every ticket must have one of the following statuses.

### Idea

An idea worth recording. The idea has not yet been evaluated or committed to.

### Planning Needed

The idea is worth investigating, but requirements, UX, architecture, or implementation details still need to be determined.

### Accepted

The work has been agreed as something Kinesis should implement.

### In Progress

Development is currently underway.

### Blocked

Work has started or been accepted but cannot currently progress.

The ticket should explain what is blocking it.

### Done

The work has been completed.

### Dropped

The work has deliberately been abandoned.

The ticket should ideally explain why it was dropped.

--- 

# Tags 

### Maturity Dependent

This is intentionally parked because Kinesis is not mature enough for us to make good design decisions about it yet.

### Foundation Dependent
Requires another core capability/architecture first

### Post-MVP
This will have to be done post MVP stage

### Experimental
Worth trying, cool idea but solution/value isn't proven

### Architecture
Changes or affects fundamental Kinesis architecture

### Integration
External Integration related 

### UX / UI
Primarily interaction or visual design work

### Data Model
Requires schema/data-model consideration

### Security
Authentication, authorization, privacy, encryption, etc.

### Needs Research
Requires external/product/technical research before designing

### Technical Debt
Existing implementation should eventually be improved/refactored

### Performance
Primarily concerned with speed/scalability


---

# Workflow

The typical lifecycle is:

```text
Idea
  ↓
Planning Needed
  ↓
Accepted
  ↓
Accepted — Needs Planning
  ↓
In Progress
  ↓
Done
```


---

# Current Backlog

## 💡 Idea

KD-004-templates-object-types
KD-005-customisable-module-widgets
KD-006-recurring-reminder-field
KD-008-adding-quick-capture
KD-010-external-app-notes-Integration
KD-012-starter-example-data
KD-013-guided-onboarding
KD-015-kinesis-timeline-review

## 🧠 Planning Needed

KD-007-adding-priority
KD-016-automated-document-field-extraction

## ✓ Accepted


## 🚧 In Progress


## Accepted — Needs Planning

KD-011-unified-todo-view
KD-017-turn-dashboard-into-decision-surface
KD-018-standardise-module-navigation
KD-019-sidebar-route-aware
KD-020-mobile-navigation-and-responsive-app

## ⛔ Blocked


## ✅ Done
KD-009-implement-authetication-system
KD-014-kinesis-calendar
KD-001-improve-milestones
KD-002-kinesis-internal-link-field
KD-003-custom-object-fields

## 🗑 Dropped


---

# Bugs

## Open

## In Progress


## Blocked


## Fixed

BUG-001-title
BUG-002-goal-showing-active


## Won't Fix


---

# ADR vs Backlog

Backlog tickets describe **work**.

Architecture Decision Records describe **decisions**.

An ADR being `Accepted` does not mean the related feature has been implemented.

Where relevant, ADRs and backlog tickets should reference each other.

---

# Principles

The backlog should remain lightweight.

A ticket should contain enough information to preserve the idea, understand its purpose, and implement it when the time comes.
