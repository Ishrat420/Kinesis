# KD-033 — Options for more Goal Details

**Status:** Done
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

## What shipped

A **Supporting information** section on the goal detail page, below Linked
Goals, using the same field engine Documents and Custom Items already had --
not a fourth implementation. A goal is now a third `Object`-backed record with
fields, alongside Documents and Custom Items, through the `ObjectField` table
those two were unified onto.

* **Storage.** `getGoal` fetches a goal's fields through its `Object` identity
  and presents them as `customFields`, matching the shape Documents and Custom
  Items already return. `updateGoalFieldsAction` writes them the same way
  `updateDocument` does: delete and recreate under one transaction, refusing a
  save that would change an existing field's type.
* **UI.** `GoalSupportingInfo` reuses `CustomFieldsEditor` unmodified for
  editing, and groups the read view into Links, Kinesis Links and Notes by
  each field's type -- matching the ticket's own example -- with an "Other
  details" bucket for Number/Date/Checkbox fields the editor still permits,
  rather than restricting the type picker to only the three named here.
* **Finance became a valid Kinesis Link target.** The ticket's own example
  links a goal to a "Savings account" -- a Finance item, which the picker did
  not previously offer. `KINESIS_LINK_TARGET_CONFIG` now includes
  `FINANCE_ITEM`, which widens every Kinesis Link field (Documents' and Custom
  Items' included), not only goals'.
* **The duplicated FormData decoder got a third caller and one home instead.**
  Documents and Custom Items each carried their own near-identical parser for
  the same five positional field arrays. Rather than write a third copy for
  Goals, both existing ones were replaced with a shared `parseCustomFields` /
  `prepareCustomFields` (`lib/custom-fields/parse.ts`), and the field-name
  mapping each form posts under moved to `lib/custom-fields/types.ts`
  (`DEFAULT_FIELD_NAMES`, `DOCUMENT_FIELD_NAMES`) so the client editor and the
  server parser can no longer drift apart. Purely a refactor: Documents' and
  Custom Items' own save behaviour is unchanged, confirmed by the existing
  test suite passing unmodified.

Verified with a full typecheck and lint (clean against the pre-existing
baseline), all unit tests passing, and a production `next build`.
