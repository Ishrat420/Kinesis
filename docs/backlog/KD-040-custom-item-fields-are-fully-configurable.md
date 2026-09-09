# KD-040 — Custom Items: Name Is the Only Fixed Field

**Status:** Accepted
**Priority:** Medium
**Tags:** Data Model, UX / UI, Foundation Dependent

## Summary

A Custom Item today has three fixed, always-present properties beyond its
Name — Notes, Due date, Link — on top of whatever structured fields a
template or ad hoc extras add. That's redundant: Link duplicates what a
`LINK`-type field already does, and Due Date now has a real
template-defined equivalent (KD-038). Only Notes has no configurable
equivalent today.

**Name becomes the only field every Custom Item is guaranteed to have.**
Everything else — including a due date, a link, or free text — is
something the module's template defines, or something added ad hoc per
item, exactly like every other field already works. Nothing is free or
implicit; everything is explicit.

```text
Today:
  Every Custom Item: Name, Notes, Due date, Link  (always)
                    + whatever the template/extras add

After this ticket:
  Every Custom Item: Name  (always)
                    + whatever the template/extras add
                      (a TEXT field for notes, a LINK field for a link,
                       a Due Date field for a due date -- all opt in)
```

## Decisions

### 1. Notes and Link become ordinary field types, not fixed properties

Anyone who wants free text on an item adds a `TEXT` field (template or ad
hoc). Anyone who wants an external link adds a `LINK` field, same as
today's ad hoc `LINK` type. Neither is special-cased anymore — a
`CustomFieldsEditor` `LINK` extra already does exactly what the fixed Link
input did, so this removes a straight duplication for Link.

### 2. Due Date stays template-only — this ticket doesn't reopen KD-038's rule, it removes the last exception to it

KD-038 already made Due Date a template-defined, singular field with no
ad hoc equivalent. The one place it *wasn't* template-only was the fixed
Due Date input every Custom Item still carried regardless of its
template. That fixed input goes away. **A due date is now reachable
exclusively through a template's Due Date field.** A module with no
template, or a template with no Due Date field, has no way to give its
items a due date — see Open Questions below for what that means for
items that already have one.

### 3. Due Date's add control moves from a separate button into the type dropdown

Superseding KD-038 Decision 1's "separate button" mechanic (not its
underlying rule): **Due Date becomes a selectable option in the ordinary
field-type dropdown — ◷ Due date — but only ever for a new, not-yet-saved
field row.** Choosing it there is the same act as clicking today's
"+ Add due date field" button; nothing existing is being converted,
because the row doesn't correspond to a saved field yet.

The guarantee KD-038/ADR-011 actually cares about — *no control ever
turns an existing field into a due date, or back* — is unchanged and
still absolute:

* An **existing, already-saved field's** dropdown never offers "Due
  date" as a choice, at any point in the template's lifecycle, editable
  or not.
* The **Due Date field's own row**, once created, is not a live dropdown
  either — it renders the same disabled/locked control every other
  field's dropdown already gets once a template is in use (reusing that
  existing visual pattern instead of a bespoke fixed badge), except it is
  disabled unconditionally, from creation, regardless of whether the
  template is in use yet.
* The "Due date" option disappears (or shows disabled) from every other
  row's dropdown the moment any row in the template has it selected —
  the one-per-template cap, enforced in the same control that offers it.

This amends ADR-011 point 1's literal wording ("There is no dropdown, at
any point...") — see the amendment note added to that ADR.

### 4. Existing data is not silently lost, but is not silently kept editable either

For items saved before this ships:

* **Notes/Link.** Non-empty existing `notes`/`link` values are migrated
  once, at ship time, into an ad hoc `TEXT`/`LINK` extra field on the
  item (labelled "Notes" / "Link" respectively) — so the data continues
  to exist as an ordinary, editable field rather than becoming a
  read-only relic or vanishing from the edit form entirely. The
  `CustomItem.notes`/`.link` columns stop being written or read by the
  app after the migration runs; whether they're dropped outright is a
  follow-up, not part of this ticket.
* **Due date.** There is no equivalent migration target — a due date can
  only live on a template's Due Date field, and an existing item's
  module may have no template, or a template with no Due Date field, so
  there is nowhere to move the value *to*. `CustomItem.dueDate` keeps
  its existing value, which keeps showing exactly where it does today
  (Needs Attention, the calendar, notifications) — it just becomes
  permanently unreachable from the UI (uneditable, unclearable) unless
  the item's own template already has a Due Date field to take over that
  job. This is an accepted, explicit trade-off of making Due Date
  template-only, not an oversight — see Open Questions for the one part
  of this still worth pinning down.

## Guardrails

* Every guardrail KD-035/KD-038 already established (type immutability
  once in use, the Decision 7 single-usage gate, one Due Date field per
  template, Due Date's value never entering `ObjectField`) applies
  unchanged. This ticket changes what's fixed on the object and how Due
  Date is added; it does not touch how templates or extras themselves
  work.
* A module with no template still works exactly as it does for extras
  today — "+ Add custom field" is unaffected by any of this.

## Open Questions

1. **Should a module ever be allowed to attach a template *after* it has
   items with an existing due date, in a way that lets someone route
   that old value into the template's new Due Date field?** Today
   nothing like that exists (a template's Due Date field always starts
   empty for an object that adopts one). Answering "no, never" is
   consistent with everything already decided above and is the default
   assumption this ticket ships with unless told otherwise.
2. **Does the Notes/Link migration need to be visible to the person**
   (e.g. an activity log entry, or just a silent one-time backfill)? No
   awareness surface currently reads either column outside the two forms
   being removed, so a silent backfill is the default assumption.

## Related

* KD-038 — Due Date as a Distinct Template Field; this ticket keeps its
  core rule (singular, template-only, writes to `CustomItem.dueDate`
  directly) intact and only revises how the field is added (Decision 1)
  and how its row renders (Decision 2).
* KD-039 — Template Fields on Item Creation; the creation dialog already
  renders template fields including Due Date — this ticket just removes
  the fixed Notes/Due date/Link inputs that used to sit alongside them.
* ADR-011 — Due Date as a First-Class, Singular Template Concept; amended
  (not reversed) by Decision 3 above.
* ADR-010 — Notification and Reminders Awareness Surfaces; unaffected —
  an ordinary `DATE` field still never drives reminders.
