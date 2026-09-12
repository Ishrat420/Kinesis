# KD-043 — Field Length Limits

**Status:** Planning Needed
**Priority:** Medium
**Tags:** Data Model, Technical Debt, UX / UI

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

## What exists today

An audit across the schema and forms found roughly 30 distinct free-text
fields spread across ~15 models — Document (`name`, `status`, `owner`,
`documentNumber`, `country`, `notes`, `link`), Goal (`name`, `note`,
`status`, `unit`), FinanceItem (`kind`, `name`, `category`, `frequency`,
`notes`), Person/Relationship (`name`, `category`, `selfNotes`, `type`,
`notes`), Milestone, CustomModule, CustomItem, Template, TemplateField, Todo,
plus the generic custom-fields engine (`ObjectField.value`) shared across
every module. Each lives in its own form component, validated (or, today,
not validated at all) by one of roughly 8 separate server action files.

None of the three layers enforce anything on these fields:

* **Database** — every one of them is a plain Prisma `String`, which maps to
  an unbounded Postgres `TEXT` column. No `@db.VarChar(n)` anywhere.
* **Server** — `parseCustomFields` / `parseTemplateFields` and the other
  action files only `.trim()` values; nothing checks length.
* **Client** — the shared value inputs (`TemplateFieldValues.tsx`,
  `CustomFieldsEditor.tsx`, and every module's own form) have no `maxLength`
  on anything but a Name field.

## Direction

Limit **by kind, not by individual field** — the same display-kind
vocabulary KD-042 already introduced (`text`, `number`, `currency`,
`percent`, `date`, `link-count`), plus a new `notes` kind for multi-line
fields. A `status`/`category`/`type` string and a `notes` field want very
different limits; picking one number for everything would either be too
tight for notes or too loose for everything else.

Tentative limits, pending confirmation:

| Kind                | Limit                              | Notes |
|---------------------|-------------------------------------|-------|
| Text                | 255 characters                      | Traditional single-line default. |
| Notes / long text   | 10,000 characters                   | ~1,500–2,000 words. |
| URL / Link          | 1,000 characters (candidate: 2,000) | Some pre-signed cloud-storage share links (S3, Google Cloud Storage) run past 1,000 chars; worth confirming against real `Document.link` values before locking this in. |
| Number              | ±9,999,999,999,999.999999           | Chosen to sit under JavaScript's safe-integer ceiling (2^53 ≈ 9.007 quadrillion) so no silent float-precision loss; 6 decimal places covers currency/percent without inviting meaningless precision. |

`Date`, `Checkbox`, and `Kinesis Link` fields need no length limit — they
aren't free text.

## Open questions

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
