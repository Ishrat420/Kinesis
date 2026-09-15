# OPS-001 — Test & CI infrastructure

**Status:** Planning Needed
**Tags:** Technical Debt

## Background

Raised during a reliability/tech-debt audit of Kinesis as a whole. Two related findings:

* The integration suite (`npm run test:integration:run`) needs a dedicated Postgres database, separate from the dev database, because it does genuinely destructive things (`prisma migrate reset --force`, a delete-all-data sweep, ad-hoc `deleteMany` calls). Bringing that database up had no committed template beyond `.env.example`'s inline comments, and no single command took a machine from "nothing exists" to "ready to test." The first time it was actually run end-to-end, it surfaced a real regression (`seedEverything` missing `Template`/`TemplateField`/`FieldLink`) that had been sitting invisible because nobody could run the suite on demand.
* There is no CI. Every check (unit, integration, typecheck, lint, build) currently runs only when a person or an AI session runs it by hand before committing. That's viable right now because all current development goes through sessions that run the full verification loop every time — but it means a regression is only ever caught by someone remembering to check, not by the repo itself.

## What's already done

* `npm run typecheck` (`tsc --noEmit -p .`) exists and is clean.
* `scripts/reset-test-database.mjs` / `npm run test:db:reset` rebuilds the test database from the real migration history, with hard-refusal guards against ever targeting `DATABASE_URL`.
* `tests/integration/settings/seed-everything.ts` is a shared, live-table-driven seed used by both `delete-all-data.test.ts` and `export.test.ts`, closing the specific drift above.
* `.claude/hooks/session-start.sh` + `.claude/settings.json` provision Postgres, the `kinesis`/`kinesis_test` databases, and `.env`/`.env.test` automatically at the start of every Claude Code web session, so AI-run tests no longer depend on leftover container state.

## What's still open

1. **CI.** No workflow runs the verification loop automatically on push/PR. Deliberately deferred — the project is moving fast enough right now that setting up CI well (a Postgres service container, secrets, not being flaky) would itself cost more attention than it saves, while every commit already goes through a manual full-suite check. Revisit once the schema/feature surface has settled down.
2. **Human-contributor test-DB setup, partially closed.** `docker-compose.yml` now exists and provisions the `kinesis` role/database out of the box, and the root `README.md`'s Getting Started section documents the one remaining manual step (`docker compose exec postgres createdb -U kinesis kinesis_test`, since the official Postgres image only creates one database per container). What's still missing is a committed `.env.test.example` — a contributor still has to know to create `.env.test` themselves with `TEST_DATABASE_URL`, which is documented in the README but not scaffolded as a copyable file the way `.env.example` is.

   Not urgent while the project has no external contributors, but worth closing before it does.

## Closed

* **`docs/testing/testing-strategy.md`'s stale "Neon" claim** — fixed. It now describes the integration database as the dedicated local PostgreSQL database it actually is, and points at the README/`docker-compose.yml` for provisioning instead of restating it. Two other drifts found while fixing it, unrelated to the Neon claim: the "Test Structure" tree hadn't been updated since `tests/integration/` grew to 17+ subdirectories, and the cross-user fixture's path was written as `tests/integration/authorization/fixture.ts` when the real path has always been `tests/integration/auth/fixture.ts`. Also added a mention of `tests/manual/checklist-before-a-release.md`, a second manual runbook that existed but was never listed alongside `authentication-lifecycle-security.md`.

## Not yet decided

* CI trigger scope (every push vs. only PRs) and whether a passing run should gate merge — open questions for whenever CI is picked up.
