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
2. **Human-contributor test-DB setup.** The session-start hook only solves this for Claude Code web sessions. A person cloning the repo fresh still has no documented path to a working `kinesis_test` database — `.env.example`'s inline comments assume Postgres, a role, and two databases already exist. Needs either:
   * a committed `.env.test.example` with a concrete (non-sensitive — local-only, throwaway) default connection string, plus a documented one-time `createuser`/`createdb` sequence in the README, or
   * a `docker-compose.yml` that provisions a Postgres container with matching credentials out of the box, removing the dependency on whatever Postgres (if any) is already installed on a contributor's machine.

   Not urgent while the project has no external contributors, but worth closing before it does.
3. **`docs/testing/testing-strategy.md` is stale in one place** — it describes the integration database as "a dedicated Neon PostgreSQL database," which no longer matches the local-Postgres setup actually in use. Should be corrected once the setup story above is finalized, rather than fixed twice.

## Not yet decided

* CI trigger scope (every push vs. only PRs) and whether a passing run should gate merge — open questions for whenever CI is picked up.
* Docker Compose vs. documented manual setup for the human-contributor case above.
