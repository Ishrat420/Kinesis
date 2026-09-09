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

### 1. Templates are editable, not frozen — and fields are live, not copied

A template field's `label`, `type`, and `position` live in exactly **one**
place: the `TemplateField` row. They are never duplicated onto an object at
creation time. An object stores only its own **value** for each template
field, plus whatever ad-hoc extras it has of its own. This is what makes
"add a field" instant and free (see Decision 7) — nothing to touch on any
object, since nothing was ever copied to it in the first place:

| Operation | Allowed? |
| --- | --- |
| Add a field | ✅ always — nothing to touch on existing objects, since nothing was ever copied to them |
| Rename a field's label | ✅ always — one edit, read live everywhere, values untouched |
| Reorder fields | ✅ always |
| Change a field's type | ✅ **until any object uses the template**, then ❌ forbidden — same rule already enforced per field row in `custom-modules/actions.ts` and `lib/data/documents.ts`, moved from per-record to per-definition |
| Remove a field | ✅ **until any object uses the template**, then ❌ forbidden outright — no warning, no confirmation, the action is simply unavailable |

A frozen template was considered and rejected: it does not protect data (adding
a field is always safe regardless), and it pushes every legitimate change
through "clone the template, re-link the module," which raises the exact same
questions a direct edit would, plus loses the point of sharing.

**The gate is "does any object use this template at all," per Decision 7 —
one existence check (`EXISTS Object WHERE templateId = X`), and every
destructive operation reads the same boolean.** Not a per-field check
against stored values, and not module linkage. This is deliberately
coarser than it needs to be in one direction — a template used by ten
objects locks every field, even ones none of them have actually filled
in — but it's a single, cheap, easy-to-explain fact instead of a query per
field, and the case it over-locks is exactly what the rename-and-add-new
workaround already covers well (see Decision 7). The UI answer is simply:
the type control, the remove action, and the delete-template action are
all disabled together, with a tooltip naming why, no confirmation step to
design.

### 2. One template, many modules

A template is not copied on link — modules that share a template share its
definitions, and an edit to the template (within the safe-operation rules above)
reaches every module using it, live, the moment it's saved: *"Used by 3
modules — adding a field here means all three see it immediately."*

Cloning a template to start a new, independent one from it stays supported —
that is how a shared template becomes the basis for something that diverges.

### 3. One template per module for now — but store it on the object

A module links to one template at a time in this iteration. Each **object**,
not just the module, records which template it followed — and, per Decision 7,
that is a *permanent, live pointer* the object reads its template's current
field list from for as long as it exists, not a one-time copy taken at
creation. This is a column being added regardless, and it is what makes
multi-template modules an additive UI change later rather than a schema
migration.

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
  listed after. "Promote an extra into the template" **ships in v1**: an
  extra's existing value stays exactly where it is on this object, and every
  other object under the template gains the new field, empty — the same
  "add a field" rule from Decision 1, just sourced from an object's ad-hoc
  field instead of typed fresh in Settings.

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
  "Linked to N modules" / "Used by N objects" (Decision 7). A shipped starter
  template shows a "Built-in" marker but is editable like any other; there is
  no locked/read-only tier for v1.
* **Create** — "New template" opens a blank template straight into the detail
  screen, no separate creation form.
* **Detail / edit** (`/settings/templates/[templateId]`) — name, and a field
  *definitions* list (label + type, no value — this is a template row, not an
  object's data): add/rename/reorder fields live, per Decision 1; changing a
  field's type or removing it, and deleting the template itself, are all
  disabled together once any object uses the template, with a tooltip naming
  why — no confirmation dialog, the actions are simply unavailable. A
  "Used by" list at the bottom links to every module on the template.
* **Clone** — on the detail screen: name prompt, copies the current field list
  into a new, independent template, opens its detail screen.

Module creation's "start from" dropdown (Decision 5) *reads* this list — it is
not a second place templates get created. Saving an in-progress module's ad-hoc
fields as a new template ("promote to template," inline from module creation)
is a reasonable later addition, not built here: it would give templates a
second birthplace to keep in sync with the Settings screen, for a case (someone
mid-module-creation deciding they want reuse) that "create the template first,
then start the module from it" already covers.

### 7. An object is linked to its template, not to its module's current setting

Two different pointers, answering two different questions, that must not be
conflated:

* **`Object.templateId`** — set once, at creation, never changed automatically.
  This is what an object actually reads its field list from: template fields
  (label, type, position — always live, never duplicated onto the object) plus
  whatever value the object itself has stored per field, plus its own extras.
  As long as this pointer exists, the object inherits every safe edit made to
  the template — a new field, a renamed field, a reorder — instantly, with
  nothing to backfill, because nothing was ever copied in the first place.
* **`CustomModule.templateId`** — purely forward-looking. It answers "what does
  the *next* object created in this module start from," nothing more. It has
  no effect on any object that already exists.

Because these are separate facts, a module can unlink from its template, or
switch to a different one, **at any time, with no precondition and no effect
on existing objects** — there is nothing to reconcile, since no object was
ever bound to what the module happens to be linked to today, only to what the
module was linked to at the moment that specific object was created. Relinking
a module later (to the same or a different template) only changes what the
*next* object gets; nothing retroactively re-templates an existing one.

This also gives every destructive template operation the same real gate,
not keyed on module linkage: **does any object have `templateId = X`.**
One check governs deleting the template outright, changing a field's type,
and removing a field (Decision 1) — a template can stay linked to modules
indefinitely without any of that ever tripping, since it depends on whether
an object actually exists under it, not on whether a module currently
points at it.

The Settings → Templates list (Decision 6) is worth showing two counts, since
they answer different questions and can disagree: *"Linked to N modules"*
(where new objects will keep coming from) and *"Used by N objects"* (what's
actually keeping the template locked).

**Freeing up a locked template means removing the objects that use it, not
unlinking the module** — module linkage was never the gate, so unlinking it
doesn't change anything. Deleting those objects is the v1 way to do that.
Detaching a single object from its template — keeping the object and its
data, but converting its template fields into permanently independent ones
so it no longer counts toward the gate — is a nicer version of the same
escape hatch, and a real feature worth having, but it needs its own
operation (snapshot the template's current fields onto that one object)
and is deliberately deferred rather than built in v1.

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
* A definition's field type is immutable, a field cannot be removed, and the
  template itself cannot be deleted, once any object uses the template
  (Decision 7) — one gate, no confirmation step, the actions are simply
  disabled.
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

Three phases, each independently shippable and independently verifiable —
every phase leaves `main`/`v1.2.0` in a working, fully-tested state, rather
than landing as one large change. Sequenced so each phase's UI is checkable
in the browser before the next one is built on top of it.

The one-gate check (Decision 7 — does any object use the template) is cheap
enough to build from day one rather than bolted on later — it's a single
existence check, always false until Phase 2 gives it anything to be true
about — so there's no separate phase for it the way an earlier draft of
this plan had (a blast-radius *count and warning* would have needed its own
phase; a plain existence check doesn't).

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
  `CustomFieldType` vocabulary `ObjectField` already uses), `position`. This
  is the one and only place a template field's label/type/position live —
  nothing downstream ever gets its own copy of them (Decision 7).
* Ownership follows the existing per-user pattern (`userId` scoping,
  `requireKinesisUser()`), same as `CustomModule`.

**UI:**
* `/settings/templates` — list, "New template" action, showing "Linked to N
  modules" / "Used by N objects" per Decision 7 (both trivially zero until
  Phase 2, but the display and the query both exist from here).
* `/settings/templates/[templateId]` — name field, field-definitions editor
  (add / rename / reorder always; type change, remove, and delete-template
  all disabled once any object uses the template, per Decision 7 — always
  enabled in this phase, since no object can exist under a template yet),
  Clone action.
* Entry point card on the main Settings page.

**Out of scope for this phase:** module linkage, object rendering (nothing
uses templates yet, so every gate in this phase is trivially unlocked).

**Depends on:** nothing new — `ObjectField`'s `CustomFieldType` vocabulary
and the existing Settings page are already in place.

### Phase 2 — Module and object link the template; values start flowing through it

**Goal:** A module can be created "starting from" a template, every object it
contains carries a live pointer to that template, and the two safety gates
from Phase 1 start meaning something real.

**Data model:**
* `CustomModule.templateId` (nullable, forward-looking only — Decision 7:
  governs what the *next* object created in this module starts from, never
  touches an object that already exists, and can be changed or cleared at
  any time with no precondition).
* `Object.templateId` (nullable, set once at creation, never changed
  automatically) — the permanent pointer an object reads its template's
  live field list from, per Decision 3/7.
* `ObjectField.templateFieldId` (nullable) — when set, this row is a
  *value* for that template field; its own `label`/`type` columns go unused
  for such a row (label/type are read from the joined `TemplateField`
  instead, never duplicated). When absent, the row is an ordinary
  ad-hoc extra, exactly as `ObjectField` behaves today.
* Object creation inside a templated module sets `Object.templateId` and
  needs no field rows created up front — a template field with nothing
  entered yet simply has no `ObjectField` row, and renders as empty. A row
  is only created once a value is actually saved.

**UI:**
* Module creation screen gains a "start from" control (Decision 5): Blank,
  or any existing template — reading the Phase 1 list directly, including
  starters.
* A gallery-style shortcut ("Add Decisions" one-click module+template) can
  ride on the same underlying action; whether it ships in this phase or
  waits is a sequencing call to make when this phase is scoped, not a
  blocker to the phase itself.
* Template detail screen's two counts (Decision 7) now populate for real,
  and the type-change/remove/delete-template gates from Phase 1 become
  live constraints instead of always-unlocked ones.

**Out of scope for this phase:** rendering template fields distinctly in the
object detail view, and "promote an extra to the template" (both Phase 3).

**Depends on:** Phase 1 (templates must exist to link).

### Phase 3 — Object detail view renders template fields live; promote-to-template

**Goal:** An object created under a template visually separates "these are
the template's fields, always present, in template order" from "these are
extras" (Decision 4), reading the template's *current* field list every
time rather than anything fixed at the object's own creation. An extra
field can be promoted into the template, becoming a real template field for
every object under it.

**UI:**
* Object detail / edit views (Custom Item, and anywhere else fields render)
  merge, at render time: the template's current field list (via
  `Object.templateId`), each shown with this object's stored value if one
  exists under its `templateFieldId` or empty if not, in the template's own
  order — then the object's own extras listed after.
* An extra field's row gets a "Add to template" action (Decision 4): creates
  a new `TemplateField` on the object's template from the extra's current
  label/type, re-points this object's existing `ObjectField` row at it via
  `templateFieldId` (its value is untouched), and every other object under
  the template immediately shows the new field, empty — the ordinary "add a
  field" case from Decision 1, just sourced from an object instead of typed
  fresh in Settings.

**Depends on:** Phase 2 (`Object.templateId` and `ObjectField.templateFieldId`
have to exist to read and write against).

## Open questions

* Whether shipped starter templates are seeded per-user or as one global
  row every user's list reads (affects the "Built-in" badge and whether
  editing a starter forks it or mutates the shared default).

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
