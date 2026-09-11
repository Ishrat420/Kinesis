# ADR-014: Kinesis Is Single-Tenant; Owner-Scoped Data Is Not Multi-Tenant Architecture

## Status

Accepted

## Context

This question keeps coming back, in different words each time: is Kinesis
single-tenant or multi-tenant, and did scoping every table by `userId`
amount to building multi-tenancy that wasn't asked for — unnecessary
complexity, and a possible performance cost, for a hypothetical future.

The two things being conflated are:

1. **Who is actually allowed to use a given deployment today** — this is
   an auth-layer policy, not a schema property.
2. **Whether the schema hardcodes "there is exactly one owner" into every
   table, or scopes rows by owner instead** — this is a schema property,
   not a statement about how many owners exist.

This ADR separates those two questions and gives one answer to point to,
instead of re-litigating it on every audit.

## Decision

**Kinesis is single-tenant today, enforced at exactly one place.**
`requireKinesisUser` (`lib/auth.ts`) rejects any authenticated Clerk user
whose id doesn't match `KINESIS_OWNER_CLERK_USER_ID`. Only one specific
person can ever be authorized against a given deployment. That is the
entire single-tenancy guarantee, and it lives in one function.

**Independent of that gate, every table is scoped by `userId`** rather
than assuming a single implicit owner — the `User` model's relations
(`documents`, `goals`, `financeItems`, `customModules`, `templates`, …)
and the `@@index([userId, …])` present on nearly every model in
`prisma/schema.prisma`. This is the part that gets flagged as "multi-tenant
decision-making," and it isn't:

* **It isn't optional infrastructure bolted on for a hypothetical future.**
  The moment there's a `User` model and Clerk authentication at all, every
  query needs to be scoped by owner to avoid one row being visible under
  another user's session — Prisma doesn't enforce row ownership on its
  own, the app does. This is true whether exactly one person is ever
  authorized to log in or a thousand are; it is not conditional on
  multi-tenancy ever shipping.
* **It has no measurable performance cost.** `userId` columns are indexed
  throughout the schema. `WHERE userId = ?` against an indexed column
  costs the same whether the table holds one owner's rows or many owners'
  rows. There is no per-tenant connection routing, no schema-per-tenant,
  no tenant-resolution middleware, no extra join introduced by this — the
  thing being audited for "slowness" doesn't correspond to an actual
  mechanism in the code.
* **The real machinery of multi-tenancy doesn't exist.** No
  Organization/Workspace/Tenant model, no cross-user sharing, no
  per-object or per-field visibility rules, no RBAC, no per-tenant
  provisioning or billing. None of that has been built. Owner-scoped rows
  are not multi-tenancy — they're the same ownership scoping any
  authenticated multi-user-capable app needs, full stop.

So the honest framing is: **single-tenant is the enforced reality, and the
schema simply doesn't hardcode that fact into every table's shape.** That
costs nothing to run today, and avoids a rewrite of every table's access
pattern if the one-line gate in `requireKinesisUser` is ever loosened.
That's the entire scope of "multi-tenant-shaped" here — it is not a claim
that multi-tenancy has been built, or even started.

## Future consideration

If multi-owner deployment or limited collaboration (sharing a page,
collaborating on a goal — KD-042's Permissions Assumption section names
this as the open question it's tracking) is ever decided, the actual work
is:

* Loosening or redesigning `requireKinesisUser`'s single-owner check.
* Building the machinery that doesn't exist yet: a sharing/visibility
  model, and likely a Workspace/Organization concept if collaboration ever
  needs to cross ownership boundaries rather than just referencing another
  user's object.

None of that is scoped, estimated, or started by this ADR. It only records
why the schema, as it already stands, doesn't need to be redesigned first
if that day comes — and why treating today's `userId` scoping as premature
multi-tenant complexity is a category error, not a real cost.

## Related

* `lib/auth.ts` (`requireKinesisUser`, `getConfiguredOwnerId`) — the one
  place single-tenancy is actually enforced.
* `prisma/schema.prisma` — the `User` model and `userId` scoping present
  across nearly every table.
* `docs/backlog/KD-042-kinesis-link-rich-preview-card.md` — Permissions
  Assumption section, the concrete case this distinction mattered for: no
  permission check is needed yet because no sharing model exists, even
  though rows are already owner-scoped.
* ADR-013 — cites this same `userId`-scoped design as one factor in
  choosing live reads over a materialized preview cache.
