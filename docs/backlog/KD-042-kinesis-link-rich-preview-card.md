# KD-042 — Rich Kinesis Link Preview Cards

**Status:** Accepted — Needs Planning  
**Priority:** Medium  
**Tags:** Kinesis Links, UX/UI, Cross-Module, Customisation

## Summary

Upgrade Kinesis Links from simple reference cards into richer previews of the linked Object.

A linked card should feel like a small live window into the target record rather than only showing its name, module and icon.

## Direction

Each Module or Object Type should define how its linked-card preview is rendered.

Example:

```text
Driving License
Documents

Expires 14 Nov 2026
42 days left · Current
````

```text
Credit Card
Finance

Balance $2,140
15.2% APR
Payment due 18 Sep
```

```text
Baby house
Test 2

Status: In progress
Due: 30 Mar 2027
Owner: Ishrat
```

## Configuration

Support a linked-card display configuration such as:

```text
Linked card preview

Primary field
[ Name ]

Show
[ Status ]
[ Due date ]
[ Priority ]
```

Allow up to **2–3 preview fields** to avoid turning cards into mini dashboards.

Dedicated Modules may provide sensible defaults, for example:

* **Documents** — expiry, status
* **Goals** — status, target date
* **Finance** — balance, APR
* **Custom Modules/Object Types** — user-configurable fields

## Behaviour

* Preview configuration should belong to the target Module/Object Type, not each individual link.
* The same linked Object should render consistently wherever it appears.
* Empty preview values should be omitted gracefully.
* Existing compact cards remain the fallback when no preview configuration exists.
* The whole card should remain clickable and navigate to the linked Object.

## Principle

> **Kinesis Links should behave like live previews of connected records, not passive hyperlinks.**

## Out of Scope

* Replacing Object Relationships

