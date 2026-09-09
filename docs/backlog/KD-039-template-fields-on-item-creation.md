# KD-039 — Show a Template's Fields on Item Creation

**Status:** Accepted
**Priority:** Medium
**Tags:** UX / UI, Foundation Dependent

## Summary

Creating an item in a templated module currently means: fill in name and
extras, save, then reopen the item to fill in the template's own fields —
because KD-035 Phase 3 deliberately scoped "render template fields live" to
the object *detail* view only, not the creation dialog. This ticket closes
that gap: **"New item" shows everything the template defines, from the
first screen, so it can be filled in and created in one action.**

```text
Module: Renewals  (started from the Renewal template)

Today:
  New item → name, extras → Create → open the item → fill in
  Provider / Amount / Renewal date → Save

After this ticket:
  New item → name, Provider / Amount / Renewal date, extras → Create
  (done — nothing left to go back and fill in)
```

## What exists today

* `NewItemButton` (`app/(app)/custom-modules/[moduleId]/NewItemButton.tsx`)
  renders a modal with name, `CustomFieldsEditor` for extras, notes, due
  date, and link — no awareness of a template at all.
* `createCustomItemAction` (`app/(app)/custom-modules/actions.ts`) already
  reads the module's `templateId` and stamps it onto the new object
  (KD-035 Phase 2), but writes no template field values — there is nothing
  in the create form for it to read yet.
* Everything the edit view needs already exists from KD-035 Phase 3:
  `TemplateFieldValues` (the fixed-label, type-matched value editor),
  `TEMPLATE_FIELD_VALUES_FORM_KEY` / `parseTemplateFieldValues`, and the
  upsert-by-`templateFieldId` write path currently living inside
  `updateCustomItemAction`.

## Decisions

### 1. Reuse the edit view's pieces; don't build a second editor

`NewItemButton`'s dialog gets a `TemplateFieldValues` block, the same
component the object detail page already uses, positioned the same way
(above the extras editor). No new field-rendering code — the only new
thing is *where* it's fed from: the module's current `templateId`, read at
the moment the dialog opens, rather than an existing object's stored
values (there are none yet — every field starts empty).

### 2. Fetch the template's field list where the module is already fetched

The module detail page (`[moduleId]/page.tsx`) already loads
`getCustomModule` and `getKinesisLinkOptions` to hand to `NewItemButton`.
It gains one more: the module's template's current field list (label,
type, position — no values to merge, since nothing has been created yet),
passed down the same way `linkOptions` already is.

### 3. `createCustomItemAction` writes template values at creation, not after

The write path already exists (`saveTemplateFieldValues`, built for
`updateCustomItemAction` in KD-035 Phase 3) — this ticket calls it from
creation too, inside the same transaction as the `ObjectField` extras
write, rather than duplicating it. Kinesis Link ownership validation
(`validateKinesisTargets`) already accepts template values alongside
extras; no new check needed there either.

### 4. Everything not there yet degrades to exactly today's behaviour

A module with no template: the dialog looks and behaves exactly as it
does today — no `TemplateFieldValues` block renders, nothing changes. This
is purely additive to the templated case.

## Interaction with KD-038 (Due Date as a template field)

KD-038 is a separate, not-yet-implemented ticket that gives a template a
distinct Due Date field, writing straight to `CustomItem.dueDate` instead
of `ObjectField`. If KD-038 ships, this dialog needs the same treatment
its own Decision 6 gives the edit view: the fixed Due Date input steps
aside in favour of the template's own due-date field, positioned wherever
the template author put it, rather than the two ever showing together.

**Sequencing:** this ticket does not depend on KD-038 to ship first — an
ordinary template (no due-date field) works exactly as scoped above with
either ticket built alone. But if this ticket ships *before* KD-038, its
own implementation will need a small follow-up once KD-038 lands, to teach
the creation dialog about the due-date field the same way the edit view
will already know about it. Worth flagging at implementation time rather
than being rediscovered as a gap later.

## Guardrails

* No new validation rules beyond what already exists for the edit path —
  this ticket is wiring, not new policy. Type immutability, the Decision 7
  usage gate, and Kinesis Link ownership all already apply identically.
* The creation dialog must never show a template field as anything other
  than empty — there is no existing object for it to have a stored value
  yet, so there is nothing to pre-fill beyond blank inputs.

## Out of scope

* Anything KD-038 itself owns (the due-date field's own mechanics) — this
  ticket only has to accommodate it once it exists, per the sequencing
  note above.
* A gallery-style "create module and first item together" flow — this
  ticket is about one dialog gaining fields it's currently missing, not a
  new combined flow.

## Related

* KD-035 — Module Templates; this ticket closes the one gap Phase 3
  explicitly deferred ("Object detail view renders template fields live" —
  the *detail* view, not creation), reusing its components and write path
  rather than building either again.
* KD-038 — Due Date as a Distinct Template Field; see the sequencing note
  above for how the two interact.
