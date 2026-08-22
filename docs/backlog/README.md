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

# Workflow

The typical lifecycle is:

```text
Idea
  ↓
Planning Needed
  ↓
Accepted
  ↓
In Progress
  ↓
Done
```


---

# Current Backlog

## 💡 Idea

| Ticket | Description |
| ------ | ----------- |
| —      | —           |

## 🧠 Planning Needed

| Ticket | Description |
| ------ | ----------- |
| —      | —           |

## ✓ Accepted

| Ticket | Description |
| ------ | ----------- |
| —      | —           |

## 🚧 In Progress

| Ticket | Description |
| ------ | ----------- |
| —      | —           |

## ⛔ Blocked

| Ticket | Description | Blocked By |
| ------ | ----------- | ---------- |
| —      | —           | —          |

## ✅ Done

| Ticket | Description |
| ------ | ----------- |
| —      | —           |

## 🗑 Dropped

| Ticket | Description | Reason |
| ------ | ----------- | ------ |
| —      | —           | —      |

---

# Bugs

## Open

| Bug | Description | Priority |
| --- | ----------- | -------- |
| —   | —           | —        |

## In Progress

| Bug | Description | Priority |
| --- | ----------- | -------- |
| —   | —           | —        |

## Blocked

| Bug | Description | Priority | Blocked By |
| --- | ----------- | -------- | ---------- |
| —   | —           | —        | —          |

## Fixed

| Bug | Description |
| --- | ----------- |
| —   | —           |

## Won't Fix

| Bug | Description | Reason |
| --- | ----------- | ------ |
| —   | —           | —      |

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
