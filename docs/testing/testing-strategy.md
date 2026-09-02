# Kinesis Testing Strategy

## Purpose

Kinesis uses layered testing to provide fast feedback for application logic
while allowing database-backed behaviour to be verified against a dedicated
test environment.

## Test Structure

tests/
├── unit/
│   ├── auth/
│   └── sanity.test.ts
├── integration/
├   ├── auth/
│   ├── db-sanity.test.ts
│   └── setup-env.ts
└── manual/

## Unit Tests

Unit tests use Vitest and do not require a database.

Configuration:

vitest.config.mts

Run interactively:

npm test

Run once:

npm run test:run

Typical coverage:
- Authorization logic
- Authentication guards
- Route behaviour
- Business logic
- Validation
- Pure functions

## Integration Tests

Integration tests use a dedicated Neon PostgreSQL database.

Configuration:

vitest.integration.config.mts

Environment:

.env.test

The test database is provided through:

TEST_DATABASE_URL

Run interactively:

npm run test:integration

Run once:

npm run test:integration:run

## Test Database

The integration database must never point to the normal Kinesis application
database.

Build the test database from the real Prisma migration history (not
`db push`, which never runs a migration's raw SQL) using:

npm run test:db:reset

This runs `prisma migrate reset --force --skip-seed` against
TEST_DATABASE_URL, so PostgreSQL objects defined only in migration SQL (for
example the `kinesis_sync_object_name` trigger) exist in the test database
exactly as they do in production. The script refuses to run if
TEST_DATABASE_URL is missing, matches DATABASE_URL from any of the shell,
`.env`, or `.env.local`, or if VERCEL_ENV is "production" or "preview".

The integration setup validates that TEST_DATABASE_URL exists and is separate
from DATABASE_URL.

## Database Sanity Check

db-sanity.test.ts verifies that:

- TEST_DATABASE_URL is configured
- it differs from DATABASE_URL
- PostgreSQL is reachable
- a real SQL query can be executed

## Manual Tests

Manual test cases live under:

tests/manual/

These are used for workflows that are currently inappropriate or unnecessarily
expensive to automate, particularly full browser and authentication journeys.

The security-focused Clerk login/logout lifecycle runbook is:

`tests/manual/authentication-lifecycle-security.md`

It must be executed against a production-like, non-production deployment before
authentication, Clerk, proxy, cookie, domain, or session-policy changes are
released. The runbook covers anonymous access, owner and non-owner login, missing
owner configuration, logout, session revocation/expiry, concurrent windows,
browser history, cookie posture, and redirect safety.

## Current Testing Philosophy

Use the cheapest appropriate testing layer:

Pure logic / permissions
→ Unit tests

Prisma constraints / provisioning / database behaviour
→ Integration tests

Full UI / browser / external authentication flows
→ Manual testing

Critical stable browser workflows
→ Consider E2E automation later

## Security-Critical Coverage

Authentication and authorization require explicit regression coverage,
including:

- unauthenticated access
- missing owner configuration
- incorrect Clerk identity
- authorized owner access
- provisioning behaviour
- concurrent provisioning
- data isolation

Database-dependent cases should be covered by integration tests rather than
mocking Prisma behaviour.
Database-backed integration tests exercise authorization/provisioning against 
the dedicated test database while Clerk remains mocked. 

Clerk is mocked at the application boundary for automated tests. 
Unit tests verify Kinesis authorization behavior against simulated Clerk identities. 

The shared cross-user fixture in `tests/integration/authorization/fixture.ts`
creates two recognizably different owners and representative records for every
owned domain. Its authorization contract covers owned positive controls,
foreign and unknown IDs, parent/child mismatch matrices, direct post-mutation
database snapshots, and atomic mixed-owner relationship payloads. New
ID-accepting reads and actions should add a row or matrix case to that contract.

The owner-provisioning integration suite covers fresh provisioning, migrated and
rotated owners, ambiguous legacy owner records, preservation of owned data during
rotation, and concurrent first requests against PostgreSQL.
