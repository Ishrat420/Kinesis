# ADR-015: Field Length and Number-Magnitude Limits, By Kind

## Status

Accepted

## Context

Before KD-043, no free-text or numeric value in Kinesis had a length or
range limit anywhere — not in the database, not in any server action, not
on any `<input>`. An audit across the schema and forms found roughly 30
distinct free-text fields spread across ~15 models (Document, Goal,
FinanceItem, Person/Relationship, Milestone, CustomModule, CustomItem,
Template, TemplateField, Todo, plus the generic custom-fields engine
`ObjectField.value` shared across every module), each validated — or, in
practice, not validated at all — by one of roughly 8 separate server
action files. Only **Name** fields (item name, template name, module
name/description) were capped, at 60–100 characters, and that limit exists
because a name is meant to be short by nature, not as a general
data-safety measure.

Kinesis had one real user and a small amount of real data at the time this
was decided. That's the moment to introduce limits — before there's a
meaningful volume of existing records that a later-chosen limit might
violate. Waiting until there's "enough data to justify it" gets the
sequencing backwards: the more real data exists, the more a new limit
risks colliding with something already stored.

Two questions needed deciding: what the limits should actually be, and how
many of the three possible enforcement layers (client, server, database)
should carry them.

### Limit granularity: by kind, not by individual field

Two approaches were considered:

1. **Per-field limits** — decide a number for each of the ~30 fields
   individually (e.g. `Document.notes` gets its own number, distinct from
   `Goal.note`'s own number).
2. **Per-kind limits** — classify every field into one of a small number of
   kinds (short text, long/multi-line text, URL, number) and give each kind
   one shared limit, reusing the display-kind vocabulary KD-042 already
   introduced (`text`, `number`, `currency`, `percent`, `date`,
   `link-count`), plus a new `notes` kind for multi-line fields.

Per-kind was chosen. A `status`/`category`/`type` string and a `notes`
field want very different limits regardless of which model they live on;
picking one number per model, or one number for everything, would either
be too tight for notes fields or too loose for short ones. A shared
vocabulary also means new fields (a new module, a new template field type)
inherit a sensible limit automatically instead of needing their own
one-off decision.

### Enforcement layers: all three, not a subset

Client-side `maxLength` alone isn't real enforcement — a direct POST
bypasses it — so a server-side check was always required for every limited
field. The open question was whether a database-level constraint should
also be added, or left as an app-level-only rule:

* A DB constraint is the only one of the three that's airtight — it holds
  even against a bug in application code, a bulk import, or a future
  code path that forgets to call the shared validator.
* But a DB constraint is also the one migration that could fail (or
  require a decision about truncating) against any existing value that
  already exceeds the new limit, which looked like it would require a
  pre-migration audit before any DB-level constraint could be added, even
  against the small amount of data that existed.

That tension was resolved by using Postgres `CHECK (...) NOT VALID`
constraints instead of `VARCHAR(n)` or a plain `CHECK`. `NOT VALID`
enforces the constraint on every future write immediately, without
scanning or validating rows that already exist (verified via
`pg_constraint.convalidated = f`). This meant the database layer could
ship immediately, with zero pre-migration audit and zero risk of the
migration itself failing or needing to truncate anything — the audit that
looked necessary turned out not to be, once `NOT VALID` was on the table.

### Violation behaviour: reject, never truncate

Silently truncating an over-limit value was considered and rejected.
Truncation would lose data the user typed without telling them, which is
worse than refusing the write outright. Rejecting with a clear,
field-named error (e.g. "Keep the notes under 10,000 characters.") is
consistent with how the rest of Kinesis's validation already behaves
(`parseCustomFields` already rejects other invalid input rather than
silently coercing it).

## Decision

**Limit every free-text and numeric field by kind, not individually, and
enforce it at all three layers: client `maxLength`, a shared server-side
check, and a `CHECK ... NOT VALID` database constraint.** Reject
violations with a clear, field-named error; never truncate.

| Kind                | Limit                        | Reasoning |
|---------------------|-------------------------------|-----------|
| Text                | 255 characters                | Traditional single-line default. |
| Notes / long text   | 10,000 characters              | ~1,500–2,000 words — generous for a free-text note without being unbounded. |
| URL / Link          | 2,000 characters               | 1,000 was considered first and rejected: some pre-signed cloud-storage share links (S3, Google Cloud Storage) routinely run past 1,000 characters. 2,000 comfortably covers those while still being a real, enforceable bound rather than "unbounded." |
| Number              | ±9,999,999,999,999.999999      | Chosen to sit under JavaScript's safe-integer ceiling (2^53 ≈ 9.007 quadrillion), so no silent float-precision loss; 6 decimal places covers currency/percent without inviting meaningless precision. |

`Date`, `Checkbox`, and `Kinesis Link` field values need no length limit —
they aren't free text.

**Server** — one shared module, `lib/validation/field-limits.ts`
(`TEXT_LIMIT`, `NOTES_LIMIT`, `LINK_LIMIT`, `NUMBER_MAGNITUDE_LIMIT`,
`checkLength`, `checkNumberMagnitude`), is the single vocabulary every
action file and the generic custom-fields engine (`parseCustomFields` for
ad-hoc fields, `saveTemplateFieldValues` for template-backed ones) checks
against, rather than each file inventing its own number.

**Client** — a matching `maxLength` on every corresponding `<input>`/
`<textarea>`. Three pre-existing ad-hoc numbers that predated this
decision (the Relationships map's own `person.detail` at 120,
`relationship.type` at 60, `reflection.text` at 5,000; Finance's own
`category` check at 60) were normalized to the shared tiers rather than
left as one-off magic numbers meaning roughly the same thing.

**Database** — a `CHECK (...) NOT VALID` constraint per column, one
migration, applied against every environment without a pre-migration
audit. `ObjectField.value` (one physical column holding every
custom-field kind at once) gets a single blanket ceiling at the loosest
tier (`NOTES_LIMIT`) rather than a per-`type` `CASE` expression — the
database layer's job is to stop anything catastrophic, not to duplicate
the app layer's precise per-kind number.

**Classifying built-in fields by kind** is a one-time, per-field manual
decision (documented in `docs/backlog/KD-043-field-length-limits-v1.3.0-DONE.md`),
since built-in modules' own native columns have no existing tag to infer a
kind from. The generic custom-fields engine already carries an explicit
`type` (and, since KD-042, `numberFormat`) to key off instead. A
`TEXT`-typed `TemplateField` gets two tiers depending on its own
`multiline` flag (already shipped in the schema, ahead of this decision):
a `Notes`-flavoured template field gets `NOTES_LIMIT`, an ordinary
single-line one gets `TEXT_LIMIT`. An ad-hoc custom field (no
`TemplateField` behind it) has no `multiline` option at all, so a
`TEXT`-typed one always gets the single-line tier regardless of how long
its own textarea looks in the UI.

**Deliberately excluded**: fields already constrained by a fixed
vocabulary or dropdown rather than free text (`Document.status`,
`Goal.status`, `FinanceItem.kind`/`frequency`), derived/computed fields
(`Document.owner`), and every Name-shaped field (`Document.name`,
`Goal.name`, `Person.name`, `Template.name`, `TemplateField.label`, etc.) —
a name's length is a different, already-mostly-handled kind of constraint,
not a general data-safety measure, so it stays out of this decision's
scope. `Document.name` itself has no length limit at all today, unlike
every other module's own name field; that's a real gap, but a Name-tier
one, left for a future Name-field–specific pass rather than folded in
here.

## Consequences

* Every free-text and numeric field in Kinesis now has an enforced ceiling
  that holds even if application code is bypassed, without having required
  any data migration or truncation to get there.
* A new field (new module, new template field type) inherits a sensible
  limit by classifying it into an existing kind, rather than needing its
  own bespoke number and its own three-layer wiring decided from scratch.
* The database layer is intentionally coarser than the server layer for
  `ObjectField.value` (one blanket ceiling instead of a per-type `CASE`).
  A future kind added to the custom-fields engine automatically gets a
  reasonable backstop at the DB layer without a schema change, at the cost
  of the DB layer not catching a too-generous value for a tighter kind —
  that precision is the server layer's job, and it does run on every write
  path.
* `CHECK ... NOT VALID` is now an established pattern in this codebase for
  adding a new constraint without an audit or migration risk against
  existing data; it should be the default reached for the next time a
  similar constraint needs adding.

## Related

* `docs/backlog/KD-043-field-length-limits-v1.3.0-DONE.md` — the ticket this
  decision was made under; contains the full per-model field
  classification table and test coverage this decision doesn't repeat here.
* ADR-013 — establishes `lib/custom-fields/kinds.ts`'s "one formatter per
  kind, not per field" pattern for preview-card display formatting, the
  same shape of decision this ADR makes for length/range validation.
* ADR-012 — Field Label Uniqueness, another cross-cutting constraint on
  the same generic custom-fields engine this ADR's `ObjectField.value`
  handling touches.
