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

Synchronise the Prisma schema with the test database using:

npm run test:db:push

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