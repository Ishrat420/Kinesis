# KD-043 — Field Length Limits

**Status:** Done
**Priority:** Medium
**Tags:** Data Model, Technical Debt, UX / UI
**Planned Release:** v1.3.0

## Shipped

All three enforcement layers exist now, for every field this ticket's own
audit named:

* **Server** — `lib/validation/field-limits.ts` (`TEXT_LIMIT`, `NOTES_LIMIT`,
  `LINK_LIMIT`, `NUMBER_MAGNITUDE_LIMIT`, `checkLength`, `checkNumberMagnitude`)
  is the one shared vocabulary every action file, and the generic
  custom-fields engine (`parseCustomFields`, `saveTemplateFieldValues`),
  calls into. `createCustomItemAction`'s own transaction had no
  try/catch at all before this -- a template field's refusal would have
  crashed instead of returning a friendly error, since nothing caught it;
  fixed alongside wiring the check in, matching `updateCustomItemAction`'s
  existing pattern.
* **Client** — a matching `maxLength` on every corresponding `<input>`/
  `<textarea>`, including normalizing three pre-existing ad-hoc numbers
  that predated this ticket to the shared vocabulary instead of leaving
  them as one-off magic numbers: the Relationships map's own
  `validateRelationshipMap` already limited `person.detail` (120),
  `relationship.type` (60), and `reflection.text` (5,000) -- each raised
  to the matching shared tier (255 / 255 / 10,000) rather than left as
  three different numbers meaning the same thing. Finance's own
  `category` check (60) similarly normalized to 255, though it turned out
  to be defensive-only: `category` renders as a closed `<select>`, not
  free text, so no client `maxLength` was needed there at all.
* **Database** — a `CHECK ... NOT VALID` constraint per column
  (migration `20261013000000_field_length_limits`), not `VARCHAR(n)`:
  `NOT VALID` enforces the constraint on every future write immediately
  without scanning or validating rows that already exist, which is what
  let this ship with zero pre-migration audit and zero risk of the
  migration itself failing (or needing to truncate anything) against
  existing data -- resolving the "Enforcement layers" open question
  below without needing the audit it originally assumed was required.
  `ObjectField.value` (one physical column holding every custom-field
  kind at once) got a single blanket ceiling at the loosest tier
  (`NOTES_LIMIT`) rather than a per-`type` `CASE` expression -- the DB
  layer's job is "stop anything catastrophic," not duplicate the app
  layer's precise per-kind number.

**Violation behaviour:** reject with a clear, field-named error
("Keep the notes under 10,000 characters."), never truncate --
resolving that open question the direction it already leaned.

**Classifying built-in fields by kind:** done per-model, documented in
the table below. A `TEXT`-typed `TemplateField` gets two tiers depending
on its own `multiline` flag (already shipped in the schema, ahead of
this ticket) -- `Notes`-flavoured template fields get `NOTES_LIMIT`, an
ordinary single-line one gets `TEXT_LIMIT`. An **ad-hoc** custom field
(no `TemplateField` behind it) has no `multiline` option at all, so a
`TEXT`-typed one always gets the single-line tier regardless of how long
its own textarea looks in the UI.

| Model | Fields | Kind |
|---|---|---|
| Document | `documentNumber`, `country` | Text |
| Document | `notes` | Notes |
| Document | `link` | Link |
| Goal | `unit` | Text |
| Goal | `note` | Notes |
| Goal | `targetValue`, `currentValue` | Number |
| Milestone | `value` | Number |
| FinanceItem | `category` | Text |
| FinanceItem | `notes` | Notes |
| FinanceItem | `amount`, `rate`, `monthlyContribution` | Number |
| Person | `category` (the map's `person.detail`) | Text |
| Person | `selfNotes` | Notes |
| Relationship | `type` | Text |
| Relationship | `notes` | Notes |
| RelationshipReflection | `text` | Notes |
| ConnectionPractice | `cadence` | Text |
| CustomModule | `description` | Text |
| ObjectField | `value`, type `TEXT` (no `multiline`) or ad-hoc | Text |
| ObjectField (template-backed) | `value`, type `TEXT` with `TemplateField.multiline: true` | Notes |
| ObjectField | `value`, type `LINK` | Link |
| ObjectField | `value`, type `NUMBER` | Number |
| Todo | `notes` | Notes |

**Deliberately excluded**, confirmed not free text: `Document.status`
(computed, not typed), `Document.owner` (derived from the account's own
display name, not user input), `Goal.status` (fixed dropdown values),
`FinanceItem.kind`/`frequency` (fixed vocabularies, `isFinanceFrequency`-
checked), `ObjectField`/`TemplateField` values of type `DATE`,
`CHECKBOX`, or `KINESIS_LINK`. Every `Name`-shaped field (`Document.name`,
`Goal.name`, `Person.name`, `Todo.name`, `CustomModule.name`,
`CustomItem.name`, `Template.name`, `TemplateField.label`,
`Milestone.name`, practice/date/goal-unit "name" fields, etc.) stays out
of this ticket's scope per its own framing -- a name's length is a
different, already-mostly-handled kind of constraint, not a general
data-safety measure. One exception worth a follow-up, not fixed here:
`Document.name` itself has no length limit at all today, unlike every
other module's own name field -- a real gap, but a Name-tier one, so
left for whoever picks up the Name-field story specifically rather than
folded into this ticket's own scope.

**Test coverage:** `tests/unit/validation/field-limits.test.ts` (the
shared helpers, pure); `tests/unit/custom-fields-length-limits.test.ts`
(`parseCustomFields`'s per-kind checks); new cases in
`tests/unit/relationship-map-payload.test.ts` (the three normalized
Relationships-map limits); and integration coverage confirming the
checks actually run against a real database, not just in a mock, across
representative surfaces: `tests/integration/documents/document-actions.test.ts`
(a link over the limit), `tests/integration/todos/create-todo.test.ts`
(notes over the limit), and `tests/integration/custom-modules/template-field-values.test.ts`
(a template field over the limit, on both creation -- the newly-added
try/catch -- and update).

## Summary

No free-text or numeric value in Kinesis has a length or range limit
anywhere — not in the database, not in any server action, not on any
`<input>`. Only **Name** fields (item name, template name, module
name/description) are capped today, at 60–100 characters, and that limit
exists because a name is meant to be short by nature, not as a general
data-safety measure.

Kinesis currently has one real user and a small amount of real data. That's
exactly the moment to introduce limits — before there's a meaningful volume
of existing records that a later-chosen limit might turn out to violate.
Waiting until there's "enough data to justify it" gets the sequencing
backwards: the more real data exists, the more a new limit risks colliding
with something already stored.

## What existed before this ticket

An audit across the schema and forms found roughly 30 distinct free-text
fields spread across ~15 models — Document (`name`, `status`, `owner`,
`documentNumber`, `country`, `notes`, `link`), Goal (`name`, `note`,
`status`, `unit`), FinanceItem (`kind`, `name`, `category`, `frequency`,
`notes`), Person/Relationship (`name`, `category`, `selfNotes`, `type`,
`notes`), Milestone, CustomModule, CustomItem, Template, TemplateField, Todo,
plus the generic custom-fields engine (`ObjectField.value`) shared across
every module. Each lives in its own form component, validated (or, before
this ticket, not validated at all) by one of roughly 8 separate server
action files.

None of the three layers enforced anything on these fields:

* **Database** — every one of them was a plain Prisma `String`, which maps
  to an unbounded Postgres `TEXT` column. No `@db.VarChar(n)` anywhere.
* **Server** — `parseCustomFields` / `parseTemplateFields` and the other
  action files only `.trim()`ed values; nothing checked length.
* **Client** — the shared value inputs (`TemplateFieldValues.tsx`,
  `CustomFieldsEditor.tsx`, and every module's own form) had no `maxLength`
  on anything but a Name field.

## Direction

Limit **by kind, not by individual field** — the same display-kind
vocabulary KD-042 already introduced (`text`, `number`, `currency`,
`percent`, `date`, `link-count`), plus a new `notes` kind for multi-line
fields. A `status`/`category`/`type` string and a `notes` field want very
different limits; picking one number for everything would either be too
tight for notes or too loose for everything else.

Limits, as shipped:

| Kind                | Limit                              | Notes |
|---------------------|-------------------------------------|-------|
| Text                | 255 characters                      | Traditional single-line default. |
| Notes / long text   | 10,000 characters                   | ~1,500–2,000 words. |
| URL / Link          | 2,000 characters                    | Decided: some pre-signed cloud-storage share links (S3, Google Cloud Storage) run past 1,000 chars, so 1,000 was too tight; 2,000 comfortably covers those while still being a real, enforceable bound rather than "unbounded." |
| Number              | ±9,999,999,999,999.999999           | Chosen to sit under JavaScript's safe-integer ceiling (2^53 ≈ 9.007 quadrillion) so no silent float-precision loss; 6 decimal places covers currency/percent without inviting meaningless precision. |

`Date`, `Checkbox`, and `Kinesis Link` fields need no length limit — they
aren't free text.

## Open questions (all resolved -- see "Shipped" above)

* **Enforcement layers.** Client-side `maxLength` alone isn't real
  enforcement (a direct POST bypasses it), so every limited field needs
  both a client hint and a server-side check. Whether a database-level
  `@db.VarChar(n)` / `CHECK` constraint is also added now, or left as an
  app-level-only rule for now, is a separate decision — a DB constraint is
  the only one that's airtight, but it's also the one migration that can
  fail (or silently truncate) against existing data if any current value
  already exceeds the new limit. That audit has to happen before any
  DB-level constraint is added, even with as little data as exists today.
* **Violation behaviour.** Reject with a clear error (consistent with how
  `parseCustomFields` already handles other invalid input) versus silently
  truncate. Rejecting seems more consistent with the rest of the app's
  existing validation style, but should be confirmed rather than assumed.
* **Classifying existing built-in fields by kind.** The generic custom-fields
  engine (`ObjectField`/`TemplateField`) already has an explicit `type`
  (and, since KD-042, `numberFormat`) to key a limit off of. Built-in
  modules' own native columns (`Document.notes`, `Goal.note`,
  `Person.selfNotes`, `Relationship.notes`, `FinanceItem.notes` vs.
  `Document.status`, `Goal.unit`, etc.) have no such tag today — each one
  needs to be manually classified as `text` or `notes` rather than inferred.
* **Relationship to the Custom Module Notes field.** A `TemplateField`-level
  "Notes" option (multi-line input, larger textarea) is being designed
  separately, modeled on the existing Due Date sentinel-dropdown pattern.
  That's a UI/input-affordance decision; this ticket is the backend
  length-limit decision, and the two are related but independent — a Notes
  *field type* doesn't have to exist yet for a `notes`-kind length limit to
  apply to, say, `Document.notes`.

## Related

* KD-042 — Kinesis Link Rich Preview Card; the display-kind vocabulary this
  ticket keys its limits off is the same one introduced there, and KD-042's
  own preview-card truncation (a hard cap on rendered characters) is a
  display-time concern this ticket doesn't replace — a stored value can
  still be within this ticket's limit and get truncated further for display
  in a tight card.
* ADR-015 — Field Length and Number-Magnitude Limits, By Kind. Records the
  decision this ticket shipped: why limits are grouped by kind rather than
  per-field, why all three enforcement layers exist, why `CHECK ... NOT
  VALID` resolved the DB-constraint-vs-audit tension, and why violations
  reject rather than truncate.
