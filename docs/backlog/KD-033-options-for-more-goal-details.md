# KD-033 — Options for more Goal Details

**Status:** Accepted — Needs Planning  
**Priority:** Medium  
**Tags:** UX/UI, Data Model, Architecture

## Summary

Allow Goals to hold additional supporting information beyond Milestones and linked Goals.

For larger or more involved Goals, it is currently difficult to store useful context without forcing that information into a Milestone or creating another Goal.

Add support for:

- **Kinesis Link** — link relevant Kinesis Objects
- **Link** — URLs to useful resources
- **Notes** — lightweight supporting context

## Example


Goal: Buy a house

Links
- First Home Buyer Guide ↗
- Mortgage calculator ↗

Kinesis Links
- Savings account
- Permanent residency goal
- House deposit document

Notes
- Spoke to broker XXX on [DATE], his number 03492XXX


## Principle

Milestones should remain meaningful checkpoints toward the Goal.

Linked Goals should remain independent outcomes that relate to the Goal.

Notes and links provide **supporting context**, without forcing that information into either concept.

## UX Direction

Add a lightweight **Supporting Information** area to the Goal detail view.

Keep it optional and unobtrusive when empty.

Reuse existing Kinesis Link and URL/link behaviour where possible.
