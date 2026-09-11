# KD-042 — Rich Kinesis Link Preview Cards

**Status:** Accepted — Needs Planning  
**Priority:** Medium  
**Tags:** Kinesis Links, UX/UI, Cross-Module, Customisation

## Summary

Upgrade Kinesis Links from simple reference cards into richer previews of the linked Object.

A linked card should feel like a small live window into the target record rather than only showing its name, module and icon.

## Direction

Each Module or Object Type should define how its linked-card preview is rendered.

Example:

```text
Driving License
Documents

Expires 14 Nov 2026
42 days left · Current
````

```text
Credit Card
Finance

Balance $2,140
15.2% APR
Payment due 18 Sep
```

```text
Baby house
Test 2

Status: In progress
Due: 30 Mar 2027
Owner: Ishrat
```

## Configuration

Support a linked-card display configuration such as:

```text
Linked card preview

Show on card (choose up to 3)
[✓] Status        Text
[✓] Due date       Date
[ ] Priority       Text
[ ] Owner          Text
[ ] Notes          Text
```

Allow up to **2–3 preview fields** to avoid turning cards into mini dashboards.

**No "Primary field" picker.** Every example above uses the record's own
`name` as the card title, with nothing configurable there — picking some
other field as the title (a Kinesis Link, a long text field) has no example
that needs it and invites a badly-rendering title for no real benefit. The
card title is always the linked Object's `name`; configuration only ever
touches the "Show" list.

Dedicated Modules may provide sensible defaults, for example:

* **Documents** — expiry, status
* **Goals** — status, target date
* **Finance** — balance, APR
* **Custom Modules/Object Types** — user-configurable fields, see
  "Where this is configured" below.

## Field Formatting

A preview field's raw value (a date, a number, a status string) needs
type-aware formatting to read like the examples above — "42 days left ·
Current", "$2,140", "15.2% APR" — not just a picked field dropped onto the
card unformatted. This is a small, closed set of **display kinds**, each
with exactly one formatter, reused by every Module and every Custom Module
field — not one formatter per Module and not a per-field override:

* `date` — relative + absolute, e.g. "42 days left · Current" within a
  bounded window (roughly 60 days), falling back to a plain absolute date
  ("14 Nov 2026") once a relative count would read worse than the date
  itself (an ever-growing "412 days left" is not an improvement).
* `number` — fixed decimal precision, not the value's raw stored precision.
* `currency` — number formatting plus the currency symbol, e.g. "$2,140".
* `percent` — number formatting plus "%", e.g. "15.2%".
* `status` — rendered as a badge, label truncated to a hard character cap
  (badges don't wrap).
* `text` — single-line, ellipsis-truncated at a fixed character budget.
* `link-count` — a Kinesis Link field's target count, not its full list.

**Resolving a field to a kind:**

* A **custom field** (`ObjectField`/`TemplateField`, typed via the shared
  `CustomFieldType` enum) maps to a kind almost 1:1 off its stored type —
  `DATE` → `date`, `TEXT` → `text`, and so on.
* A **dedicated Module's native column** (Finance's `balance`, `apr`; not
  an `ObjectField` at all) has no runtime type tag to infer a kind from, so
  its kind is stated explicitly in that Module's hardcoded preview config
  (e.g. `balance: currency`, `apr: percent`) rather than inferred.

Either way, the render step only ever deals with `{value, kind}` pairs —
it doesn't need to know whether a field's value came from a custom field or
a native column, only which kind it is.

Whatever the value, the card layout itself also caps total lines/characters
as a backstop, so the formatter is never the only thing standing between an
unusual value and a broken card.

## Where This Is Configured

* **Custom Modules** — a Custom Item's field set belongs to the `Template`
  it points to (KD-035), not to the `CustomModule` itself, so preview
  configuration is scoped to the Template and lives on the existing
  Template settings page (`app/(app)/settings/templates/[templateId]`),
  as a new section alongside the existing field-list editor. The field
  picker is limited to that template's own field list, so it inherits each
  field's `CustomFieldType` — and therefore its display kind — for free;
  the user never sees or picks a "kind" directly. A live preview, rendered
  from one real item under that template (or a placeholder if none exist
  yet), updates as fields are checked/unchecked.
* **System Modules** (Documents, Goals, Finance) — these don't have
  user-editable field lists the way Templates do; their preview fields are
  a hardcoded config per Module, shipped in code, with no Settings UI in
  v1. Making a dedicated Module's preview fields user-selectable is a
  bigger feature (making native columns user-configurable) and belongs in
  its own ticket if it's ever wanted, not folded into this one.

## Data Model Impact

**This is a UI + storage ticket, not UI-only** — but the storage change is
narrow and does not touch Kinesis Links' own data model.

* **Untouched:** `FieldLink` and `ObjectField` — a link still just points at
  a target object, stored and resolved exactly as it is today. "Read live
  from the linked Object" is a query-time concern (which records to
  batch-fetch), not a change to how a link itself is created or stored.
* **New:** `Template` needs a place to persist its chosen preview fields —
  a small config column (e.g. JSON: the list of selected field ids, capped
  at 3) — since no such column exists on it today. That's a migration,
  however small.
* **No change** for System Modules' config, since it's a hardcoded object
  in code rather than user data.

Worth calling out explicitly since "Out of Scope: Replacing Object
Relationships" could otherwise read as "this ticket makes no schema
changes at all," which isn't quite true.

## Behaviour

* Preview configuration should belong to the target Module/Object Type, not each individual link.
* The same linked Object should render consistently wherever it appears.
* Empty preview values should be omitted gracefully.
* Existing compact cards remain the fallback when no preview configuration exists.
* The whole card should remain clickable and navigate to the linked Object.
* Preview values must be read live from the linked Object rather than copied onto the Kinesis Link.
* Changes to the linked Object should automatically be reflected anywhere its preview card is rendered.

## Permissions Assumption

Preview rendering assumes the viewer has the same access to the target
Object as the Kinesis Link itself. That's true today by construction — a
link can only be created to target an object the same `userId` owns
(`lib/data/kinesis-links.ts` scopes both the picker and
`validateKinesisTargets` by `userId: user.id`), and no sharing, per-object,
or per-field visibility model exists yet. So there is currently no scenario
where a user can see a link but not its target, and this ticket doesn't add
a permission check at render time — there's nothing yet for it to check.

This is a known seam, not an oversight: Kinesis is single-tenant today but
every table is already scoped by `userId` rather than assuming one implicit
user, deliberately keeping the door open for a possible future where one
database container serves multiple people and/or limited collaboration
(sharing a page, collaborating on a goal) is allowed. If and when that
ships, preview rendering is exactly where a permission check would need to
be added — and reading live per render (rather than the materialized-cache
alternative considered in ADR-013) means that check has a natural home to
slot into: the same batched fetch step, re-run on every render, rather than
a cached value that could keep showing data from before access was
revoked with no re-check point at all. See ADR-014 for why this
`userId`-scoped-everywhere design is single-tenant policy, not multi-tenant
infrastructure.

## Principle

> **Kinesis Links should behave like live previews of connected records, not passive hyperlinks.**

## Out of Scope

* Replacing Object Relationships

## Related

* ADR-013 — records the decision to fetch preview data via batched, narrow
  live queries rather than a materialized preview cache, and why.
* ADR-014 — records why Kinesis's `userId`-scoped-everywhere schema is
  single-tenant policy, not multi-tenant infrastructure, which this
  ticket's Permissions Assumption section relies on.

