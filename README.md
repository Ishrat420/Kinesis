# Kinesis

Kinesis is a personal life-admin application, one private account per person: Goals, Documents,
Finance, Relationships, Custom Modules, To-Dos, and a Calendar that pulls
dated things from all of them, all built on top of a shared "Object"
capability layer (custom fields, cross-record links, search, notifications)
so a capability written once applies everywhere.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Prisma 6 +
PostgreSQL · Clerk (auth) · Tailwind CSS 4 · Vitest

> **Before touching anything Next.js-specific, read [`AGENTS.md`](./AGENTS.md).**
> This project runs a Next.js version with real breaking changes from what
> most tooling and training data assumes (for example: `proxy.ts`, not
> `middleware.ts`). Check `node_modules/next/dist/docs/` against the version
> actually installed rather than relying on memory.

## Getting Started

Prerequisites: Node 20+, Docker (or a local PostgreSQL 16 instance), and a
[Clerk](https://clerk.com) application.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start PostgreSQL.** `docker-compose.yml` provisions a `kinesis` role
   and database on `localhost:5432`:

   ```bash
   docker compose up -d
   ```

   Kinesis also needs a second, separate database for integration tests,
   which the compose file does not create by itself:

   ```bash
   docker compose exec postgres createdb -U kinesis kinesis_test
   ```

   (If you already have Postgres running locally instead of via Docker,
   create an equivalent `kinesis` role/database and a `kinesis_test`
   database by hand.)

3. **Configure environment variables.** Copy `.env.example` to `.env` and
   fill in the database and Clerk values:

   ```bash
   cp .env.example .env
   ```

   ```bash
   DATABASE_URL="postgresql://kinesis:kinesis@localhost:5432/kinesis?schema=public"
   CLERK_SECRET_KEY="sk_..."
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
   KINESIS_OWNER_CLERK_USER_ID="user_..."
   ```

   See [Authentication setup](#authentication-setup) below for what
   `KINESIS_OWNER_CLERK_USER_ID` does and how to find it.

   Integration tests read their own `.env.test`, which is not covered by the
   copy above — create it separately:

   ```bash
   TEST_DATABASE_URL="postgresql://kinesis:kinesis@localhost:5432/kinesis_test?schema=public"
   ```

4. **Apply migrations and start the app**

   ```bash
   npx prisma migrate deploy
   npm run dev
   ```

   The app runs at `http://localhost:3000` and redirects to `/sign-in`
   until the Clerk identity named by `KINESIS_OWNER_CLERK_USER_ID` signs in.

## Project Structure

```text
app/
  (app)/         Authenticated routes, one directory per module
                 (goals/, documents/, finance/, relationships/,
                 custom-modules/, todos/, calendar/, settings/, user/)
  api/           Route handlers (CSP reports, settings export)
  sign-in/       Clerk sign-in page — the one route that isn't behind auth
lib/
  data/          Server-side data access, one file per module, plus the
                 shared Object capability layer (lib/data/objects.ts)
  <module>/      Module-specific pure logic (lib/goals/health.ts,
                 lib/relationships.ts, ...)
  dates/, format/, search/, notifications/, reminders/, ...
                 Cross-module shared logic
prisma/
  schema.prisma, migrations/
docs/
  decisions/     Architecture Decision Records
  backlog/       The ticket system — KD (product work), bugs/, ops/
  testing/       Testing strategy
  vision/        Product vision and core principles
  security/      Auth audit, Clerk configuration, credential rotation
```

## Available Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | `prisma generate`, then the production build |
| `npm start` | Run an already-built production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:run` | Unit tests, watch / single run — no database needed |
| `npm run test:integration` / `test:integration:run` | Integration tests against `TEST_DATABASE_URL`, watch / single run |
| `npm run test:db:reset` | Rebuild the integration test database from the real migration history |
| `npm run db:deploy` | Apply migrations (also reconciles a database that reached its current schema through an old `prisma db push`) |

## Documentation

* [`AGENTS.md`](./AGENTS.md) — read this first; see the callout above.
* [`docs/decisions/`](./docs/decisions) — ADRs, one per module or
  subsystem decision (Modules, Documents, Goals, Finance, Relationships,
  Search, Authentication, Quick Capture, Notifications, ...).
* [`docs/backlog/`](./docs/backlog/README.md) — the ticket system: KD
  (product work), `bugs/`, and `ops/`, with the status/tag taxonomy
  explained in its own `README.md`.
* [`docs/testing/testing-strategy.md`](./docs/testing/testing-strategy.md)
  — the full testing approach and commands.
* [`docs/vision/`](./docs/vision) — product vision and core principles.
* [`docs/security/`](./docs/security) — authentication audit, Clerk
  configuration, and credential rotation notes.

## Authentication setup

One Kinesis deployment can host many people, each with their own private
account (ADR-014). Clerk decides who can sign in; Kinesis gives every signed-in
person their own account, and nobody can see anyone else's data.

**Before deploying, put the Clerk instance in Restricted sign-up mode**
(Clerk Dashboard → Configure → Restrictions), so accounts exist only by
invitation. Invite people from Clerk Dashboard → Users → Invitations. Every
user already in the Clerk instance will be able to sign in, so review that
list first. Details: `docs/security/clerk-configuration.md`.

Configure the standard Clerk keys, plus the admin's Clerk user ID, the one
person who may invite others:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
KINESIS_OWNER_CLERK_USER_ID=user_...
```

Clerk Frontend API proxying is disabled by default. The personal production
deployment, which uses Clerk production (`pk_live_...` / `sk_live_...`) keys,
must additionally set:

```bash
CLERK_FRONTEND_API_PROXY_ENABLED=true
```

Leave this variable unset (or set it to `false`) in local development 
and preview deployments that use Clerk development (`pk_test_...` /
`sk_test_...`) keys. Only the exact lowercase value `true` enables proxying.

Find the `user_...` value on the admin's Clerk dashboard profile. It doesn't limit
who can sign in (Restricted sign-up mode does that), and leaving it unset just means
nobody can invite through Kinesis.

### Replacing or recovering the owner account

If the Clerk owner is deleted or must be replaced:

1. Create or select the replacement user in Clerk and ensure it has a primary email.
2. Move the Kinesis account to the replacement identity, against the deployment's
   database. Run it once without `--yes` first to see what it will do:

   ```bash
   DATABASE_URL="..." npm run owner:rebind -- --from user_old --to user_new --yes
   ```

3. Change `KINESIS_OWNER_CLERK_USER_ID` to the replacement Clerk user ID in the
   deployment environment, then redeploy or restart every application instance.
4. Sign in as the replacement user and check your data is there.

Signing in never moves an account on its own: a Clerk identity Kinesis hasn't
seen before always gets a new, empty account. If the replacement signed in before
step 2, it got one; `owner:rebind` removes it as long as it's still empty, and
refuses otherwise. `--from unbound` claims the one account with no Clerk identity
bound, for a database that predates Clerk sign-in.

`owner:rebind` moves an account, with all its data, to another identity, so run it
only against an identity you control, and restrict who can reach the production
database. Changing `KINESIS_OWNER_CLERK_USER_ID` only changes who may invite; it
grants no access to anyone's data. Never expose `CLERK_SECRET_KEY` to the browser.

### Product and data-model decision

Kinesis is a **personal application that one deployment can host for many
people** (ADR-014):

- Every account is one person's own; nobody can see or change anyone else's data.
  There is no sharing, collaboration, organization or team model.
- Accounts exist only by invitation (Clerk Restricted sign-up mode), sent by the
  admin named in `KINESIS_OWNER_CLERK_USER_ID`.
- Every personal-data record is tied to its account through `userId`, and every
  read and mutation enforces it. Any new data function must be added to the
  two-account suites (`tests/integration/auth/cross-user.test.ts` and
  `isolation-probe.test.ts`) before it's done.
- Kinesis users have normal generated local IDs, separate from their Clerk IDs.

## Testing

See `docs/testing/testing-strategy.md` for the Kinesis testing approach and commands.

### Adding a model a user can own

If it should be covered by "delete all data" or the data export, add it to
both -- and add one creation for it in
`tests/integration/settings/seed-everything.ts`. That seed is shared by
both features' integration tests, which each read the live table list out
of PostgreSQL rather than a hardcoded one, so a table missing from either
feature fails its test instead of silently shipping incomplete. See
"Account-Wide Sweep Coverage" in the testing strategy doc.

## Notifications

In-app notifications (the bell), Upcoming & Due, and Needs Attention are all
**derived, not stored**: each computes what should currently be visible —
documents nearing expiry, due milestones, due To-Dos, upcoming relationship
dates, due custom items, overdue goals — directly from the live records
every time it is read. There is nothing to trigger, nothing to wait for, and
no scheduled job involved: create or edit a record so it falls inside its
own reminder window (for a document, an expiry date and a `prompt` period
that includes today), then open the app and check the bell.

There used to be a daily cron (`/api/notifications/evaluate`) whose only job
was silently archiving a goal once its target date passed. That's gone
(KD-028): a goal's status only ever changes when someone changes it, through
the app's own Change status action. A goal past its target date, left
Active, keeps its milestones reminding and shows a red "Overdue" chip
instead. See `docs/decisions/ADR-010-Notification-and-Reminders-Awareness-Surfaces.md`
for the full policy this drives from, and `docs/backlog/KD-028-goal-lapse-awareness-v1.3.0-DONE.md`
for how that decision was reached.

### Troubleshooting

- **The bell/Upcoming & Due/Needs Attention doesn't show something you
  expect:** none of these involve a cron or a background job — they
  recompute live on every read. Check the record's own dates/settings
  (reminder lead days, whether reminders are enabled, the goal or parent
  goal's status) rather than looking for something to trigger.
- **The database reports that a table does not exist:** run
  `npx prisma migrate deploy` against that database.

## Deployment

Vercel's `buildCommand` (`vercel.json`) is `npm run db:deploy && npm run build`
— migrations are applied as part of every build, not as a separate manual
step. `db:deploy` (`scripts/deploy-database.mjs`) also reconciles a database
that reached its current schema through an old `prisma db push` before a
migration history existed, and retries `prisma migrate deploy` up to three
times on a `P1002` advisory-lock timeout — expected the first time a
scale-to-zero database wakes up to serve the deploy — before failing for
real.
