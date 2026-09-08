# KD-035 — Module Templates: Reusable Field Structure for Custom Modules

**Status:** Accepted — Needs Planning
**Priority:** Medium
**Tags:** UX / UI, Data Model, Architecture, Foundation Dependent

## Summary

A **Template** is a reusable, named set of field definitions. A Custom Module
may be linked to a template on creation (or later), and every object created in
that module automatically starts with the template's fields — structure defined
once, not re-invented per record.

```text
Template: Decision
  Fields
  - Date *
  - Why?
  - Kinesis Links
  - Notes

Module: Decisions  (icon, colour — started from the Decision template)
  → every object in this module carries Date / Why? / Kinesis Links / Notes,
    with room for its own extra fields on top
```

This replaces the original "standalone Object Types with their own screen and a
new OBJECT TYPES sidebar section" direction. That direction is closed; see
KD-036 for what it was and why it was dropped in favour of this.

## The model

Three concepts, each answering a different question, with no overlap between
them:

| Concept | Answers | Has a screen? |
| --- | --- | --- |
| **Module** | *Where does this live?* | Yes — name, icon, colour, sidebar entry, list view |
| **Template** | *What shape does it have?* | No — pure structure, no place of its own |
| **Object** | *This specific record* | Lives in one module, in whatever the module's screen looks like |

An object lives in exactly one module and optionally follows one template. A
template has no place to appear on its own — there is nothing for it to collide
with, which is what made the earlier "Object Type" direction ambiguous with a
single-type module (see KD-036).

## What exists today

* `CustomModule` carries a name, icon, colour and description — **no structure**.
  Two items in the same module can have completely different fields, or none;
  the module contributes no shape at all.
* `CustomItemField` rows are created ad hoc, per item, at save time. There is no
  field *definition* anywhere in Kinesis today — this is the first place one is
  introduced.
* `Document.name` / `CustomItem.name` already exist and are already
  database-trigger-synced to `Object.name` (see the `20260902000000` and
  `20260903000000` migrations). Nothing new is needed for identity — this
  direction was only a problem for the standalone-object route in KD-036, not
  for this one.

## Decisions

### 1. Templates are editable, not frozen

Safety comes from which *operation* is performed, not from locking the whole
template:

| Operation | Allowed? |
| --- | --- |
| Add a field | ✅ always — every object using the template just gains a new empty field |
| Rename a field's label | ✅ — values are untouched |
| Reorder fields | ✅ |
| Change a field's type | ❌ **forbidden** — the same rule already enforced per field row in `custom-modules/actions.ts` and `lib/data/documents.ts`, moved from per-record to per-definition |
| Remove a field | ⚠️ allowed, with a warning naming how many objects — **across how many modules** — hold data in it |

A frozen template was considered and rejected: it does not protect data (adding
a field is always safe regardless), and it pushes every legitimate change
through "clone the template, re-link the module," which raises the exact same
questions a direct edit would, plus loses the point of sharing.

**Field removal is the one genuinely dangerous operation here and deserves the
most care in implementation** — the warning must show blast radius across every
module using the template, not just the one being edited from.

### 2. One template, many modules

A template is not copied on link — modules that share a template share its
definitions, and an edit to the template (within the safe-operation rules above)
reaches every module using it. Editing shows blast radius: *"Used by 3
modules — this adds a field to all of them."*

Cloning a template to start a new, independent one from it stays supported —
that is how a shared template becomes the basis for something that diverges.

### 3. One template per module for now — but store it on the object

A module links to one template at a time in this iteration. Each **object**,
not just the module, records which template it followed. This is a column being
added regardless, and it is what makes multi-template modules an additive UI
change later rather than a schema migration.

Multi-template modules (e.g. a "Home" module holding an Appliance template and a
Warranty template side by side) are deliberately deferred — not designed against,
just not built yet.

### 4. Extra fields stay allowed

An object may carry fields beyond its template, exactly as Documents already
allow today. Two consequences worth stating plainly:

* **This is what makes the migration free.** A module with no template linked is
  exactly today's behaviour, unchanged — every existing custom module's ad-hoc
  fields keep working as-is, as "extras," whether or not it ever adopts a
  template.
* Template fields should render distinctly from extras in the object's detail
  view — always present, in template order, even when empty — with extras
  listed after. "Promote an extra into the template" is a reasonable later
  addition, not needed for v1.

### 5. Shipped starter templates collapse the setup cost

The main objection to this direction over standalone objects is an extra setup
step: create a module, then link a template, before creating your first object.
Two things remove that cost for the common case:

* **Template choice is part of module creation**, not a separate step — one
  screen: name, icon, colour, and "start from: Decision / Blank / …".
* **A gallery entry can create the module and link the template in one action** —
  "Add Decisions" from a template gallery produces a ready module immediately.

Anyone using a shipped template pays no extra step at all; anyone building their
own pays one dropdown.

## Dependencies

Shared with KD-034 — do not duplicate this work, do it once:

1. **Unify `DocumentField` and `CustomItemField` into one object-scoped field
   store.** Both hosts are already `Object`-backed. This ticket's field
   *definitions* sit above that store; building it twice (or three times, once
   Goals arrive per KD-033) is the exact duplication this whole effort exists to
   remove.
2. **Replace the positional FormData encoding** that currently rejoins field
   arrays by index (see KD-034 for the detail — `CustomFieldsEditor`'s empty
   hidden inputs exist purely to keep that alignment, and it cannot survive a
   field carrying more than it does today).

## Terminology

**Module, Template, Object.** "Object Type" is retired from the product
vocabulary — see KD-036. A module is a *place*; a template is a *shape*; an
object is a *record*. Onboarding should teach these three, not four.

## Guardrails

* System fields — name/title, identity, created/updated, archive state — are
  never part of a template's configurable fields and never recreated by hand.
* A definition's field type is immutable once created (per the operation table
  above).
* Warn before removing *or* retyping a definition that holds data, naming how
  many objects across how many modules are affected.
* No workflow builders, no formulas, no relations beyond Kinesis Links (KD-034).
* Reuse the existing field type vocabulary, editor and value storage — the
  definition layer above them is what's new here, not the field types
  themselves.

## Principle

> If configuration is enough, use a Template. If unique behaviour is the
> product, use a dedicated Kinesis feature.

## Out of scope

* Module-less / standalone objects, and any dedicated navigation for them — see
  KD-036, superseded by this ticket
* Multi-template modules (deferred, not designed against — see Decision 3)
* Module view customisation, grouping, filtering, saved views
* Template versioning or a live "this module tracks template v2" concept
  beyond the shared-edit model in Decision 1–2
* Arbitrary workflow builders, AI-generated schemas
* Full Airtable / Notion-style database functionality

## Open questions

* Exact UI for the field-removal blast-radius warning — module names, object
  counts, and whether removal requires typing a confirmation for anything above
  a threshold.
* Whether "promote an extra field into the template" ships in v1 or later.
* Whether a template itself is ever renamed/retired independently of the
  modules using it, and what that means for modules still linked to it.

## Related

* KD-036 — the sidebar/standalone-object direction this replaces; read for why
  a single-type module and a standalone Object Type screen turned out to be the
  same thing with no reason to be two
* KD-034 — multi-value Kinesis Links; shares both prerequisites above, and is
  where cardinality/per-field type restriction would live if templates ever
  want them
* KD-033 — goal supporting information; Goals become a template host through
  this ticket
* KD-024 — universal object capability layer; every templated object still
  inherits it in full (identity, ownership, linking, archive, search)
* KD-003 — custom object fields; the ad-hoc system this builds a definition
  layer above, without breaking it
