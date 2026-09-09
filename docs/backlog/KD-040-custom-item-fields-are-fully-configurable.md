# KD-040 — Custom Items: Name Is the Only Fixed Field

**Status:** Done
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

### 4. No migration — there is no existing data to carry forward

Kinesis has no real users or data yet, so there is nothing saved under
the old fixed Notes/Due date/Link inputs that needs a migration path.
`CustomItem.notes`/`.link`/`.dueDate` simply stop being written or read
by the app once this ships; whether the columns themselves are dropped
outright is a follow-up, not part of this ticket. If this ever changes —
Kinesis gets real users before this ships — this decision is the first
thing to revisit, not an assumption to carry forward blindly.

## Guardrails

* Every guardrail KD-035/KD-038 already established (type immutability
  once in use, the Decision 7 single-usage gate, one Due Date field per
  template, Due Date's value never entering `ObjectField`) applies
  unchanged. This ticket changes what's fixed on the object and how Due
  Date is added; it does not touch how templates or extras themselves
  work.
* A module with no template still works exactly as it does for extras
  today — "+ Add custom field" is unaffected by any of this.

## Resolved Questions

Both questions this ticket originally raised turned on there being
existing data to protect, which there isn't (Decision 4):

1. *Should a module ever let someone attach a template after the fact and
   route an old due date into its new Due Date field?* Moot — there are
   no old due dates to route. Retroactively attaching an existing object
   to a template is a separate, bigger feature (KD-035 built `templateId`
   as write-once-at-creation, full stop) that this ticket doesn't need to
   open just to answer this.
2. *Does the Notes/Link migration need to be visible?* Moot — there's no
   migration.

## What shipped

* **Notes and Link inputs removed.** `NewItemButton` (create) and
  `EditCustomItemForm` (edit) no longer render the fixed Notes textarea or
  Link input. `createCustomItemAction`/`updateCustomItemAction` stop
  reading/writing `CustomItem.notes`/`.link` entirely — an item that wants
  free text or an external link adds a `TEXT`/`LINK` field, template or ad
  hoc, exactly like any other field.
* **Due Date input removed for good — not just when a template already
  supplies one.** The fixed Due Date input (and its "step aside when the
  template has one" logic from KD-038 Decision 6) is gone from both forms.
  `createCustomItemAction`/`updateCustomItemAction` now resolve `dueDate`
  exclusively from the item's template's Due Date field, if it has one —
  `null` otherwise, with no fallback to a plain form field. Unlike Notes
  and Link, `CustomItem.dueDate` itself stays fully live — it's still the
  same column Needs Attention, the calendar, and notifications read; only
  the fixed-input path to it is gone.
* **Due Date's add control moved into the type dropdown**
  (`TemplateFieldsEditor`), replacing the separate "+ Add due date field"
  button: a brand-new, not-yet-saved row's dropdown now lists "◷ Due
  date" alongside Text/Number/Date/Checkbox/Link/Kinesis Link. An
  existing, already-saved row's dropdown never offers it. Once a row is
  the Due Date field (new or after a page reload), its dropdown renders
  as the same disabled, single-option control every locked field's
  dropdown uses — unconditionally, not just once the template is in use.
  The "◷ Due date" option itself disappears from every other row the
  moment one field has it, enforcing the one-per-template cap in the
  control that offers it.
* **ADR-011 amended** (not reversed) to match: point 1's guarantee — no
  control ever converts an existing field into a due date or back — holds
  exactly as before; only the mechanic offering it to a *new* field moved
  from a button into the dropdown.
* No data migration, per Decision 4 — nothing existed to migrate.

Test coverage: the KD-039 unit-test file
(`tests/unit/create-custom-item-template-fields.test.ts`) already covered
Due Date routing through a template field, so it needed no changes; one
obsolete unit test asserting the old fixed Due Date input's validation
(`tests/unit/validation/action-feedback.test.ts`) was removed as no
longer reachable. The integration test purpose-built for due-date
behaviour (`tests/integration/custom-modules/due-date.test.ts`) was
rewritten to route every case through a template's Due Date field instead
of a plain form field, plus one new case confirming a module whose
template has no Due Date field never gets one.

Verified with `prisma validate`, a full typecheck and lint (clean, no new
errors against the pre-existing baseline), the full unit suite passing
(625 tests), and a production `next build`.

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
