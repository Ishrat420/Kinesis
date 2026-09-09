# KD-035 — Module Templates: Reusable Field Structure for Custom Modules

**Status:** Accepted
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

### 6. Templates are managed from Settings, not born inside module creation

Templates get their own management surface: **Settings → Templates**.

* **List** (`/settings/templates`) — one row per template: name, field count,
  "Used by N modules." A shipped starter template shows a "Built-in" marker but
  is editable like any other; there is no locked/read-only tier for v1.
* **Create** — "New template" opens a blank template straight into the detail
  screen, no separate creation form.
* **Detail / edit** (`/settings/templates/[templateId]`) — name, and a field
  *definitions* list (label + type, no value — this is a template row, not an
  object's data): add/rename/reorder fields live, per Decision 1; changing a
  field's type is disabled once the field exists; removing one opens the
  blast-radius confirmation from Decision 1. A "Used by" list at the bottom
  links to every module on the template.
* **Clone** — on the detail screen: name prompt, copies the current field list
  into a new, independent template, opens its detail screen.

Module creation's "start from" dropdown (Decision 5) *reads* this list — it is
not a second place templates get created. Saving an in-progress module's ad-hoc
fields as a new template ("promote to template," inline from module creation)
is a reasonable later addition, not built here: it would give templates a
second birthplace to keep in sync with the Settings screen, for a case (someone
mid-module-creation deciding they want reuse) that "create the template first,
then start the module from it" already covers.

## Dependencies

Shared with KD-034 — do not duplicate this work, do it once. **Both shipped
with KD-034** (branch `v1.2.0`), so this ticket builds directly on top rather
than needing either itself:

1. ~~**Unify `DocumentField` and `CustomItemField` into one object-scoped field
   store.**~~ Done — `ObjectField`, keyed by `objectId`, is what Documents,
   Custom Items, and Goals all read and write today.
2. ~~**Replace the positional FormData encoding.**~~ Done — `CustomFieldsEditor`
   now submits one JSON payload (`CUSTOM_FIELDS_FORM_KEY`); no index-aligned
   arrays left to work around.

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

## Implementation phases

Four phases, each independently shippable and independently verifiable —
every phase leaves `main`/`v1.2.0` in a working, fully-tested state, rather
than landing as one large change. Sequenced so each phase's UI is checkable
in the browser before the next one is built on top of it, and so the
riskiest operation (field removal) is built last, on top of plumbing that
already exists by then rather than growing its own copy.

### Phase 1 — Template schema + Settings → Templates CRUD (standalone)

**Goal:** Templates exist, are fully manageable, and nothing else in the app
knows about them yet. No module or object reads a template. This is the
foundation every later phase sits on, and it's the one phase with no
integration risk — it can be built, tested, and demoed entirely inside
Settings.

**Data model:**
* `Template` — `id`, `userId`, `name`, `isStarter` (or similar, to mark
  shipped defaults for the "Built-in" badge — see open question below on
  whether starters are seeded per-user or global), timestamps.
* `TemplateField` — `id`, `templateId`, `label`, `type` (same
  `CustomFieldType` vocabulary `ObjectField` already uses), `position`. No
  `value` column — a definition, not data.
* Ownership follows the existing per-user pattern (`userId` scoping,
  `requireKinesisUser()`), same as `CustomModule`.

**UI:**
* `/settings/templates` — list, "New template" action.
* `/settings/templates/[templateId]` — name field, field-definitions editor
  (add / rename / reorder always; type change disabled once a field exists,
  per Decision 1), delete-field confirmation (plain confirmation in this
  phase — the blast-radius *count* is Phase 4; this phase can name "this
  field" without yet knowing how many objects hold data in it, since nothing
  holds data in it yet), "Used by" list (empty in this phase), Clone action,
  delete-template action.
* Entry point card on the main Settings page.

**Out of scope for this phase:** module linkage, object rendering, blast
radius counts (nothing uses templates yet, so both are trivially zero).

**Depends on:** nothing new — `ObjectField`'s `CustomFieldType` vocabulary
and the existing Settings page are already in place.

### Phase 2 — Module creation reads templates; module and object record which one

**Goal:** A module can be created "starting from" a template, and every
object it contains knows which template it followed.

**Data model:**
* `CustomModule.templateId` (nullable — a module with none behaves exactly
  as today, per Decision 4).
* `Object.templateId` (nullable) — recorded per Decision 3, on the object
  rather than only the module, so a future multi-template module needs no
  further schema change.
* On object creation inside a templated module: seed the object's fields
  from the template's current field list (label/type/position copied in as
  starting `ObjectField` rows, empty values) rather than copying nothing and
  relying on the template being re-read later — the object's fields are its
  own from creation, editable and extendable exactly as today.

**UI:**
* Module creation screen gains a "start from" control (Decision 5): Blank,
  or any existing template — reading the Phase 1 list directly, including
  starters.
* A gallery-style shortcut ("Add Decisions" one-click module+template) can
  ride on the same underlying action; whether it ships in this phase or
  waits is a sequencing call to make when this phase is scoped, not a
  blocker to the phase itself.
* Template detail screen's "Used by" list now populates for real.

**Out of scope for this phase:** rendering template fields distinctly in the
object detail view (that's Phase 3 — this phase only needs the fields to
exist and behave as ordinary `ObjectField` rows); editing a template's
fields after objects already exist under it (Phase 1's editor already
allows this mechanically, but the *consequence* — do existing objects gain
the new field, does the blast-radius warning need real counts — is Phase 4
territory, since before Phase 2 there was nothing to affect).

**Depends on:** Phase 1 (templates must exist to link).

### Phase 3 — Object detail view renders template fields distinctly

**Goal:** An object created under a template visually separates "these are
the template's fields, always present, in template order" from "these are
extras," per Decision 4.

**UI:**
* Object detail / edit views (Custom Item, and anywhere else fields render)
  order template-linked fields first, in the template's own order, even when
  a given field is still empty on this particular object — then extras
  after.
* No new data model — this reads `Object.templateId` (Phase 2) plus
  `ObjectField.templateFieldId`-or-equivalent linkage to know which stored
  fields came from the template versus were added ad hoc. (Whether that
  linkage is its own column added in Phase 2 or inferred by label match is
  worth deciding when Phase 2 is scoped — a column is more robust since
  labels can be renamed on either side independently.)

**Out of scope for this phase:** "promote an extra into the template" (named
in the ticket as a reasonable later addition, not v1).

**Depends on:** Phase 2 (needs objects that actually carry a template link
to render).

### Phase 4 — Field-removal blast-radius query + confirmation UI

**Goal:** Removing a field from a template — the one operation the ticket
calls out as genuinely dangerous — shows real impact before it happens:
"Used by 3 modules, 14 objects hold data in this field," not just a generic
"are you sure."

**Data:**
* A query, given a `templateFieldId`, counting objects (across every module
  linked to the template) that hold a non-empty value in the corresponding
  field — this is why it's sequenced last: it wants Phase 2's linkage and
  real usage to count against, or it can only ever report zero.

**UI:**
* Phase 1's plain delete-field confirmation upgrades to name the real count
  and the affected modules, per the ticket's guardrail. Exact copy, and
  whether a count above some threshold requires typing a confirmation
  phrase, is the ticket's still-open UI question — worth settling at the
  start of this phase rather than carrying it further.

**Depends on:** Phase 2 (object↔template linkage to count against) and,
for the "which modules" half specifically, nothing beyond that.

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
