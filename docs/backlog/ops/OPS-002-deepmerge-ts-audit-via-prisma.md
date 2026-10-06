# OPS-002 — `deepmerge-ts` audit finding via Prisma

**Status:** Blocked
**Tags:** Security, Technical Debt

## Background

`npm audit` reports a high-severity advisory,
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx):
`deepmerge-ts` below 8.0.0 can exhaust the stack when merging an object
graph that refers to itself. Kinesis doesn't use it directly; it arrives
through `prisma` → `@prisma/config` → `deepmerge-ts@7.1.5`.

It's the only `npm audit --omit=dev` finding left after v1.5.0's
non-breaking `npm audit fix`.

## Why it's deferred

* **Not exploitable here.** Only the Prisma CLI's config loader uses it, at
  build and migrate time, never while the app is serving requests. It
  merges `prisma.config.ts`, which is ours, isn't self-referencing, and
  can't be influenced from outside.
* **No good fix yet.** The latest `@prisma/config` still pins
  `deepmerge-ts@7.1.5`. `npm audit fix --force` would downgrade Prisma to
  6.12.0, which is breaking. Forcing 8.x with an npm `overrides` entry is a
  major-version jump inside Prisma's own tooling, so it's not worth it for
  a risk that doesn't apply.

**Blocked on:** a Prisma release whose `@prisma/config` depends on
`deepmerge-ts` 8 or later.

## When it unblocks

1. Upgrade `prisma` and `@prisma/client` together to that release.
2. Confirm `npm ls deepmerge-ts` shows 8.x and `npm audit --omit=dev` is
   clean.
3. Run the full verification loop (typecheck, lint, unit and integration
   tests, build), plus `npm run db:deploy` against a test database.

## Related

* `braces` (through `eslint-config-next`) is also still flagged, but it's
  development tooling only. Its offered fix downgrades
  `eslint-config-next` to 14.x. Revisit when `eslint-config-next` updates
  its `fast-glob` chain.
