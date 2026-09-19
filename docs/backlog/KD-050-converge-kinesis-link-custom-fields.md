# KD-050 — Converge Kinesis Link Custom Fields into Typed Kinesis Links

**Status:** Shipped, pending real-data migration on next deploy. All five
phases below are implemented, typechecked, linted, and covered by the
integration suite; the data migration itself
(`20261008000000_migrate_kinesis_link_custom_fields`) has been syntax- and
logic-verified against synthetic data locally (dedup case included) but
has not yet run against any real user data, since this environment's own
database is a separate, empty local instance from what the deployed app
uses. It runs automatically, without further action, the next time this
branch is deployed (`prisma migrate deploy`, already wired into
`scripts/deploy-database.mjs`).
**Priority:** High
**Tags:** Architecture, Data Model, UX / UI
**Supersedes:** KD-049 §2's explicit deferral ("this ticket does not decide to
retire or merge Kinesis Link Custom Fields"). Real usage showed the natural
entry point people reach for is "Add custom field → Kinesis Link," so the
two mechanisms are being converged rather than kept side by side indefinitely.

## What's converging into what

There are two separate things today that both end in a `KinesisLinkCard`:

1. **Kinesis Link Custom Field** (older) — a `CustomFieldType.KINESIS_LINK`
   value on the generic `ObjectField` table, with one or more targets via
   `FieldLink`. Added through "Add custom field" → choose type → "Kinesis
   Link" → pick targets from a multi-select. Saved as part of the record's
   whole custom-fields batch (delete-all-fields, recreate-all-fields, one
   transaction).
2. **Kinesis Links** (KD-049, Phases 1–4) — an `ObjectRelationship` row per
   link, with a DDL of types (Supports/Blocks/Depends on/Related to/
   Alongside, plus ad-hoc Custom) and a derived label shown as a pill on the
   card. Saved immediately, one link at a time, via its own server actions.

Going forward: choosing **"Kinesis Link"** from "Add custom field" creates a
Kinesis Link (mechanism #2), not a Kinesis Link Custom Field. Mechanism #1's
storage (`ObjectField`/`FieldLink` of type `KINESIS_LINK`) stops being
created by that flow, and every existing row of that kind is migrated once.

## What's explicitly *not* in scope

Investigated before writing this plan (see research notes): `ObjectField`
rows of type `KINESIS_LINK` come from **two different producers**, not one:

- **Ad-hoc custom fields**, via `CustomFieldsEditor.tsx` — this is what "Add
  custom field" means, and what this ticket converges.
- **Template field *values***, via `TemplateFieldValues.tsx` — a custom
  module's *template* can define a field of type `KINESIS_LINK` once (e.g.
  the starter template's built-in "Related" field), and every item of that
  type gets a value slot for it. This is a different flow (defining a
  module's shape, not adding one record's own extra field) and is
  **staying exactly as it is**. Its `ObjectField` rows are distinguished by
  a non-null `templateFieldId` and are excluded from the migration below.
  `CUSTOM_FIELD_TYPES` (the shared type list) is also used by
  `TemplateFieldsEditor.tsx` for defining those template fields — that
  picker keeps offering Kinesis Link; only `CustomFieldsEditor.tsx`'s own
  ad-hoc "add a field to this record" picker changes.

Also confirmed: **Person and Finance Item have no custom-field UI at all**
today (ad-hoc or Kinesis Links) — nothing to change there. They remain
valid Kinesis Link *targets*, unaffected.

## The uniqueness bug this surfaces

`ObjectRelationship`'s uniqueness is `(userId, pairKey, type)` (KD-049
Phase 1). For `type = CUSTOM`, that means **only one ad-hoc-text Kinesis
Link is allowed between any two Objects, ever, regardless of what the text
says.** That's a real latent limitation — a Custom Kinesis Link's whole
point is arbitrary text, and two people should be able to add "Backup
contact" and "Emergency contact" as two separate Custom links to the same
Person. It also directly blocks this migration: your Document has both a
"Relates to" field and a "Depends On" field (both `KINESIS_LINK` custom
fields); if either pair of targets ever overlapped, migrating both to
`type = CUSTOM` between the same pair would collide on this constraint.

**Fix:** make `CUSTOM`'s uniqueness include `customLabel`, while every other
type keeps uniqueness on `(userId, pairKey, type)` alone. Postgres can't
express "customLabel matters only for CUSTOM" as one plain unique
constraint (a `NULL` customLabel never equals another `NULL` in a unique
index, which would silently stop enforcing uniqueness for every
canonical-type row instead). The correct shape is two **partial unique
indexes**, added by hand-written migration SQL (Prisma's schema DSL can't
express a partial index, so this lives in the migration, not
`@@unique(...)` in `schema.prisma`):

```sql
DROP INDEX "ObjectRelationship_userId_pairKey_type_key";
CREATE UNIQUE INDEX "ObjectRelationship_canonical_pair_type_key"
  ON "ObjectRelationship" ("userId", "pairKey", "type")
  WHERE "type" != 'CUSTOM';
CREATE UNIQUE INDEX "ObjectRelationship_custom_pair_label_key"
  ON "ObjectRelationship" ("userId", "pairKey", "customLabel")
  WHERE "type" = 'CUSTOM';
```

This is a real correctness fix independent of the migration (it also
matters for anyone hand-typing two different Custom labels to the same
target through the existing Kinesis Links picker today) — not scope creep,
but it does mean touching the schema again, so it's called out explicitly
rather than folded in silently.

## Data migration (one-off, not lazy/on-read)

For every ad-hoc `ObjectField` where `type = 'KINESIS_LINK'` and
`templateFieldId IS NULL`:

- For each of its `FieldLink` rows: create one `ObjectRelationship` —
  `sourceObjectId` = the field's `objectId`, `targetObjectId` =
  `FieldLink.targetObjectId`, `type = CUSTOM`, `customLabel` = the field's
  own `label`, **verbatim** (per your call — no fuzzy-matching to the real
  DDL types), `userId` resolved from the source Object's own `userId`.
- A field with the *same label* pointing at the *same target* as another
  migrated row (a true duplicate) is skipped rather than violating the new
  partial unique index, and logged so nothing silently vanishes without a
  record of it.
- Once converted, the source `ObjectField` row and its `FieldLink` rows are
  deleted.
- Runs as a script (matching how this repo already hand-writes migration
  SQL and runs one-off scripts under `scripts/`), against a real snapshot
  first so its output can be reviewed before it touches your actual data.

## UI changes

1. **`CustomFieldsEditor.tsx`** — its own type-choosing `<select>` (used
   only for ad-hoc fields, not `TemplateFieldsEditor.tsx`'s) stops offering
   Kinesis Link as a field type to add to the local batch. Instead,
   choosing it opens the same inline add-form `KinesisLinks.tsx` already
   has (target picker + the 9-option DDL/Custom picker) and submits
   immediately via the existing `addKinesisLinkAction` — a live save, not
   part of the record's batched custom-fields submit, since that's how
   every other Kinesis Link already saves.
2. **Read views** (`EditDocumentForm.tsx`, `GoalSupportingInfo.tsx`,
   `EditCustomItemForm.tsx`) — the ad-hoc `linkedFields` grid (one `<h3>`
   heading + cards per `KINESIS_LINK` field) goes away for ad-hoc fields;
   `EditCustomItemForm.tsx` keeps rendering *template-value* Kinesis Link
   fields exactly as today (out of scope), just no longer merges in ad-hoc
   ones, since there won't be any left to merge.
3. **Standalone "Kinesis Links" section** (its own header, count badge and
   "Add Kinesis Link" button) is removed from Document/Custom Item/Goal
   pages, per your answer. Its list of existing links (cards with their
   resolved-label pill, edit/remove kebab) moves to render in the same
   place the old ad-hoc `linkedFields` grid used to — no header, no count,
   no add button there, since adding now happens through "Add custom
   field."

## Phases

1. **Schema (Shipped).** The two partial unique indexes above, in
   `20261007000000_kinesis_link_custom_uniqueness` (migration SQL only, no
   Prisma DSL change beyond dropping the old `@@unique`). Covered by two
   new integration tests: different Custom labels between the same pair
   now coexist; an exact duplicate is still rejected.
2. **Data migration (Shipped, not yet run on real data).** A pure-SQL
   migration, `20261008000000_migrate_kinesis_link_custom_fields`, folded
   into the normal deploy pipeline rather than a standalone script (per
   how this repo already ships data migrations, e.g. the starter-template
   dedup) — no separate script, no credentials handled by hand.
   `INSERT ... ON CONFLICT ... DO NOTHING` relies on Phase 1's partial
   index for the dedup case; verified against synthetic pre-migration data
   locally (two ad-hoc fields sharing a label and target collapsed into
   one Kinesis Link; a differently-labeled one converted on its own; the
   source `ObjectField`/`FieldLink` rows removed). Runs automatically on
   the next `prisma migrate deploy`.
3. **`CustomFieldsEditor.tsx` (Shipped).** Choosing "Kinesis Link" from
   "Add custom field" is unchanged as a menu item, but no longer adds a
   row to the batch: it opens the same target + DDL/Custom picker
   `KinesisLinks.tsx` used to own (`DirectionField`/`TargetPicker`,
   exported for reuse) and submits immediately via `addKinesisLinkAction`,
   as a `formAction` on its own button rather than a nested `<form>`
   (this editor already lives inside the record's own form). The
   parameter is optional and omitted on every creation-time caller
   (`NewItemButton.tsx`, `ManualDocumentButton.tsx`), which keeps the old
   batched, multi-target behavior unchanged there, since there is no
   object yet to link from before the record itself is created.
4. **Read views (Shipped).** `KinesisLinks.tsx` itself dropped its header,
   count badge, "Add Kinesis Link" button and inline create-form — its
   `options`/`addAction` props are gone, since adding happens through
   Custom Fields now; it is display, retype and remove only. The old
   ad-hoc `linkedFields` grid is gone from Documents, Custom Items and
   Goals; the typed Kinesis Links list renders in its place (Custom
   Items' template-defined Kinesis Link fields, via `TemplateFieldValues`,
   are untouched and keep rendering exactly as before, since they are a
   different producer entirely — see "What's explicitly not in scope").
5. **Tests (Shipped).** The new Phase 1 coverage above; the migration's
   own logic (conversion + dedup) verified functionally against synthetic
   data rather than as a checked-in test, matching this repo's existing
   convention of not unit-testing a migration's raw SQL directly (no
   `CustomFieldsEditor`-level interaction tests, or read-view layout
   tests, exist for the same reason no other component in this codebase
   has them).

## Related

* **Supersedes:** KD-049 §2 (which explicitly left this decision for later,
  now made).
* **Touches:** `lib/custom-fields/*`, `components/custom-fields/*`,
  `app/(app)/documents/*`, `app/(app)/goals/*`,
  `app/(app)/custom-modules/*`, `prisma/schema.prisma`.
* **Leaves untouched:** `TemplateFieldValues.tsx` / `TemplateFieldsEditor.tsx`
  and template-defined Kinesis Link fields (including the starter
  template's "Related" field) — a separate, later decision if ever revisited.
