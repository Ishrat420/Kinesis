# ADR-014: One Kinesis Per Person, Many People Per Deployment

## Status

Accepted. Revised 6 October 2026 (v1.5.0).

This replaces the original ADR-014, *"Kinesis Is Single-Tenant; Owner-Scoped
Data Is Not Multi-Tenant Architecture"*. That version made each deployment
serve exactly one person. This version keeps one person per Kinesis but lets
one deployment serve many people. It is a change of direction, and the
reasons are recorded here. The original reasoning about `userId` scoping still
holds and is carried forward under "What stays the same".

## Context

The original ADR answered a recurring question: did scoping every table by
`userId` amount to building multi-tenancy nobody asked for? Its answer was
no. Kinesis was single-tenant, enforced in one place (`requireKinesisUser`
only admitted `KINESIS_OWNER_CLERK_USER_ID`). Owner-scoped rows were just the
scoping any authenticated app needs, and they kept the schema from
hard-coding "exactly one owner" into every table.

That was always single tenancy with multi-user *capability*: the schema could
hold many people's data, but the deployment admitted one person. What
changes now is that we want to use that capability.

The goal is **not** collaboration. People will not share data, see each
other's records or work on the same goal. The goal is that more than one
person can have their own Kinesis. That was already possible without any
code changes: give each person their own web server, database, Clerk
application, environment variables, migrations and cron job. It works, but
the cost and the administration grow with every person added:

* one hosting project and one database per person, paid for separately;
* every migration, dependency upgrade and deploy repeated per person;
* every secret, cron schedule and push key configured per person;
* every incident investigated per deployment.

## Decision

**Kinesis is a personal application, and a deployment can host many people.**
Each account is one person's own, private Kinesis. Many accounts live side by
side in one deployment and one database, and no account can see or affect
another in any way.

In practice:

1. **The account is the unit of isolation, not the deployment.** Everything a
   person creates belongs to their `User` row. Every table either carries
   `userId` or is reached only through a parent that does. Nothing is shared
   between accounts: no shared records, workspaces, templates or settings.

2. **One deployment, one database, many accounts.** One web server, one
   Postgres database, one migration history, one daily push cron and one
   Clerk application serve everyone. Adding a person costs an invitation, not
   a new set of infrastructure.

3. **Access is by invitation only.** Public sign-up stays off. The person
   running the deployment invites people by email through Clerk (Restricted
   sign-up mode plus invitations). They are the only one who can.

4. **A new identity gets a new, empty account. Always.** Signing in never
   hands an existing account to a different identity. Moving an account to a
   new identity, for owner rotation, is an explicit operator step,
   `npm run owner:rebind`, recorded as an `OWNER_REBOUND` security event.

5. **Isolation is enforced in the application and proven by tests.** Every
   query is scoped to the signed-in account. Every new data function must be
   covered by the two-account tests: `tests/integration/auth/cross-user.test.ts`,
   which checks that owner A acting on owner B's ids changes nothing, and
   `tests/integration/auth/isolation-probe.test.ts`, which checks that
   nothing of B's reaches A through any read. A feature isn't done until its
   reads and writes are in those suites.

6. **A separate deployment per person remains possible.** It's the same code
   with one account in it. Anyone who wants physical isolation can still have
   it; it just isn't the default.

### Why this is the driver

* **Cost and administration.** One set of infrastructure for everyone,
  instead of one set per person.
* **Scale.** If Kinesis is ever used by more than a handful of people, this
  is the only reasonable way to run it. Per-person deployments don't scale
  operationally.
* **Future collaboration.** If people ever need to share something (a goal
  with a partner, a document with family), it can only happen when both
  accounts live in the same database. Separate deployments would make
  collaboration a cross-system integration problem. A shared deployment makes
  it a permissions problem, which is much smaller.

## What stays the same

The reasoning in the original ADR still applies:

* **`userId` scoping isn't optional infrastructure.** Any authenticated app
  has to scope queries by owner, because Prisma doesn't enforce row ownership
  on its own. That was true with one person and it's true with many.
* **It has no measurable performance cost.** `userId` is indexed throughout
  the schema, and `WHERE "userId" = ?` costs the same whether a table holds
  one person's rows or many people's. There's no per-tenant routing,
  schema-per-tenant or tenant-resolution middleware.
* **Kinesis is not a shared workspace.** There's still no Organization,
  Workspace or Team model, no sharing, no per-record visibility rules and no
  roles beyond "the operator can invite people".

## What this is not

* **Not collaboration.** Nobody sees anyone else's data. Collaboration, if it
  comes, will be a separate, deliberate decision with its own ADR (see
  "Future collaboration" below).
* **Not end-to-end private from the operator.** Whoever runs the deployment
  has access to the database and to the Clerk dashboard, which lists users'
  email addresses. Other users can't see a person's data; the operator always
  can, short of per-account encryption, which Kinesis doesn't have. Invited
  people should be told this plainly.

## Implementation status

**Done (v1.5.0):**

* Every query scoped to the signed-in account, confirmed by a full audit of
  every database call and every server action.
* Two-account tests across every data module: the cross-user suite (65
  tests) and the isolation probe (53 checks, with seeded data in every
  table). Both were checked by deliberately breaking the scoping, which made
  them fail.
* Owner adoption removed: a new identity always gets a new, empty account
  (`lib/auth.ts`), and rotation is `npm run owner:rebind`.
* Push notifications unsubscribed when the session ends, so a shared device
  never carries the previous person's notifications.
* Per-account data export and "delete my data", each already tested against
  a second account.
* The gate is open: `proxy.ts` and `requireKinesisUser` admit any signed-in
  Clerk user, to their own account. `KINESIS_OWNER_CLERK_USER_ID` only marks
  the admin (`isKinesisAdmin`, `requireKinesisAdmin` in `lib/auth.ts`).

**Still to do (operator, per environment, before deploying):**

* Turn on Clerk's Restricted sign-up mode, and review the instance's existing
  users: everyone already in it can now sign in. Then invite from the Clerk
  dashboard. See `docs/security/clerk-configuration.md`.

**Later:** an in-app "Invite someone" screen for the admin, built on
`requireKinesisAdmin`.

## Consequences

**Benefits:** the cost and administration described above; one place to
deploy, migrate, monitor and back up; a straightforward path to collaboration
later.

**Costs and risks:**

* **One mistake affects everyone.** A missing `userId` filter in a shared
  database exposes another person's data, not just a second copy of your
  own. With separate deployments it couldn't. That's why rule 5 is a rule
  and not a guideline. As the number of accounts grows, Postgres row-level
  security is the next safeguard to add: the database itself refusing rows
  from another account even if a query forgets its filter.
* **One breach exposes everyone.** A compromised database or deployment
  exposes every account at once. Credentials, backups and access to the
  hosting provider need the care that implies.
* **Restoring one person is harder.** Restoring a database backup restores
  everyone. Per-account export is the tool for one person; a per-account
  restore doesn't exist yet.
* **Sensitive integrations raise the stakes.** KD-044's possible bank
  connection argued its risk was lighter because one person's token sat in a
  database under their own control. In a shared deployment that no longer
  holds: tokens for many people would sit together, held by an operator who
  isn't them. Per-account encryption of such secrets, at minimum, becomes a
  prerequisite before anything like that ships.

## Future collaboration

If sharing is ever wanted, it builds on this rather than replacing it. The
account stays the owner of every row, and sharing becomes an explicit grant
("A lets B see this goal"), checked wherever a read crosses an account
boundary. KD-042's live Kinesis Link previews are a natural first place for
that check, because they already re-fetch on every render rather than
caching. None of this is designed or scheduled. It's recorded here only
because it's one of the three reasons for this decision.

## Alternatives considered

* **One deployment per person (the previous default).** It needs no code
  changes and gives physical isolation, but cost and administration grow
  with every person, and it rules out collaboration. Kept as an option, not
  the default.
* **A database or schema per person inside one deployment.** It has most of
  the operational cost of separate deployments (migrations multiplied by
  every person, connection management) without their independence. It adds
  nothing at Kinesis's scale.
* **Postgres row-level security now.** It's a strong second safeguard, but it
  needs the account set on every database transaction through Prisma, a real
  refactor. Deferred until the number of accounts justifies it. The
  two-account test suites are the safeguard until then.

## Related

* `lib/auth.ts` (`requireKinesisUser`) and `proxy.ts`: where sign-in is
  gated today, and where the gate opens.
* `scripts/rebind-owner.mjs`, `docs/security/credential-rotation.md`: owner
  rotation.
* `tests/integration/auth/cross-user.test.ts`,
  `tests/integration/auth/isolation-probe.test.ts`: the isolation contract.
* `docs/vision/00-Vision.md`: updated to match this decision.
* ADR-013 and KD-042: live preview reads, the natural place for a future
  sharing check.
* KD-044: the bank-integration risk note this decision changes.
