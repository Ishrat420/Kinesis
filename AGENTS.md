<!-- BEGIN:nextjs-agent-rules -->
# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
<!-- END:nextjs-agent-rules -->

## This project specifically

Running Next.js 16.2.9 / React 19.2 — newer than most training data assumes. A few things already differ here from the pre-16 conventions you might expect, confirmed in this codebase:

- `proxy.ts` replaces `middleware.ts` (already migrated — there is no `middleware.ts` in this repo).
- `params`, `searchParams`, `cookies()`, and `headers()` are async-only; there is no synchronous fallback.
- Turbopack is the default bundler for `next dev`/`next build` (no `--turbopack` flag needed).

The rest of the App Router mental model — layouts, pages, Server Components, Server Actions — is unchanged. This isn't a different framework, just a newer one with a documented, specific set of breaking changes. Check the bundled docs when unsure rather than assuming.
