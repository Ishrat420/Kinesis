# KD-038 — Due Date as a Distinct Template Field

**Status:** Accepted
**Priority:** Medium
**Tags:** Data Model, Foundation Dependent

## Summary

A template can include, at most, one **Due Date** field — a distinct kind of
field, not an ordinary `DATE` field someone happened to name "Due Date."
Adding one gives every object under that template a real due date: the same
`CustomItem.dueDate` column, and the same Needs Attention / notification /
calendar behaviour, that a Custom Item's fixed Due Date input already
produces today.

```text
Template: Renewal
  Fields
  - Provider (Text)
  - Amount (Number)
  - Due Date  ← added via its own action, not the Text/Number/Date picker

Object under Renewal
  → its Due Date field IS the object's CustomItem.dueDate --
    shows in Needs Attention, the bell, Upcoming & Due, the calendar,
    exactly like every other custom item's due date does today
```

See ADR-011 for why this has to be a distinct field rather than a property
of an ordinary date field, and why system modules are excluded from this
by construction rather than by a rule someone has to remember.

## Scope

**In:** Custom Item templates only. KD-035 Decision 3 already restricts which
object type can follow a template at all — Custom Item is the only one — so
this ticket only ever has one host to design for.

**Out:**

* Every system module (Document, Goal, Relationship, Finance, Person). None
  of them can follow a template in the first place (KD-035 Decision 3), so
  none of them can reach this feature through any path this ticket adds —
  see ADR-011.
* Reminders and recurring reminders. Out of scope entirely; a future feature
  layers on top of "there is a due date," whatever object it came from,
  the same way reminders already work today.
* The item-creation dialog showing this field at creation time — that's a
  separate, not-yet-numbered ticket that applies to every template field,
  not something specific to Due Date.

## Decisions

### 1. A separate creation path, not a type-dropdown option

The template field editor gets a second button — **"+ Add due date field"**
— next to the existing "+ Add field." It's only available while the
template doesn't already have one, and disappears once it does.

Due Date is never one of the choices in the ordinary field-type dropdown
(Text / Number / Date / Checkbox / Link / Kinesis Link). There is no control
anywhere that turns an existing `DATE` field into a due date, or a due date
back into an ordinary field. Not "locked once the template is in use" the
way an ordinary field's type is (KD-035 Decision 1) — locked from the
moment it's created, because the conversion path doesn't exist to begin
with.

### 2. Its row is a fixed badge, not a live control

Once created, that field's "type" cell renders as a plain, non-interactive
"Due Date" badge — never a dropdown, at any point in the template's
lifecycle. Its **label** stays fully editable and reorderable like any
other field, per the existing "field labels carry no semantics" principle
(KD-034/035) — what makes it *the* due date is never the label, it's the
badge, which stays visible regardless of what the person calls it. That is
the direct fix for naming a plain date field "Due Date": doing that does
nothing, because only a field created through this button carries the
badge.

### 3. Its value writes to `CustomItem.dueDate`, never to `ObjectField`

No `ObjectField` row is ever created for it. Filling it in on an object
writes straight to the same column the fixed Due Date input already writes
to today; reading it back for display reads that column. This is what
gives it real behaviour — Needs Attention, notifications, and the calendar
already read `CustomItem.dueDate`, so nothing downstream needs to learn
anything new.

One consequence worth stating plainly: **there is nothing to migrate.**
An item that already had a due date set through the old fixed input, before
its template ever had a due-date field, is reading and writing the exact
same column either way. The moment a template gains one, every item under
it — old or new — just starts seeing that value through the new slot.

### 4. Cap of one, enforced twice

The "+ Add due date field" button hides itself once the template has one —
UI convenience. The actual save still refuses a second one, server-side —
the real guarantee, same pattern as every other rule in KD-035 (the UI hint
is never what's actually protecting correctness).

### 5. Removal uses the existing lock, not a new one

Removing a due-date field is governed by the same single gate KD-035
Decision 7 already built — blocked once any object uses the template. No
bespoke rule: an object already relying on a field for its real due date
(sitting in Needs Attention, driving a reminder) can't have that pulled out
from under it silently, for the same reason removing any other in-use field
can't.

### 6. The old fixed Due Date input steps aside, not alongside

For an item whose template supplies its own due-date field, the fixed Due
Date input on the create/edit forms disappears — the template's field
takes over that slot, positioned wherever the template author put it among
the other fields. An item with no template, or a template that doesn't
define one, keeps the fixed input exactly as it works today. The two are
never shown together; they'd both be editing the same column, which would
read as a bug even though it technically wouldn't be one.

## Guardrails

* Every guardrail already in KD-035 (Decision 1's operation table, Decision
  7's single usage gate) applies to a due-date field exactly as it does to
  any other field, except where explicitly overridden above (no
  type-dropdown path, ever — stricter than the general rule, not looser).
* A due-date field is never offered, anywhere, to a host that isn't a
  Custom Item template — enforced by construction (KD-035 Decision 3), not
  by a check this ticket has to add or remember.

## Open questions

* **Exact schema shape** for marking a `TemplateField` as the due-date
  field — a boolean flag (`isDueDate`) beside the existing `type: DATE`, or
  a distinct type identity kept out of the `CustomFieldType` enum
  `ObjectField` shares with Documents/Goals/ad-hoc extras entirely. Leaning
  toward the boolean flag for simplicity: since a due-date field never
  produces an `ObjectField` row regardless of which shape is chosen, a
  separate enum wouldn't add any additional guarantee `ObjectField` doesn't
  already have — the real protection is the UI never offering a conversion
  path, which holds either way. Worth confirming before implementation
  rather than assuming.
* Exact placement/icon for the "Due Date" badge, and whether the "+ Add due
  date field" button needs its own explanatory copy the first time someone
  sees it.

## Related

* ADR-011 — Due Date as a First-Class, Singular Template Concept; the
  product reasoning this ticket implements.
* ADR-010 — Notification and Reminders Awareness Surfaces; already
  establishes that an ordinary custom `DATE` field must never drive
  reminders, which is the existing rule this ticket deliberately doesn't
  break — it adds a new, distinct way to get a real due date, not a new
  meaning for the old one.
* KD-035 — Module Templates; this ticket is additive to it, built entirely
  on Decision 3 (only Custom Item can follow a template) and Decision 7
  (the single usage gate).
* A separate, not-yet-numbered ticket for showing a template's fields, due
  date included, on the item-creation dialog rather than only after
  creation.
