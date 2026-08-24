# ADR-007: Global search function

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

The original header search received snapshots of several modules as component props and filtered them in the browser. This made the initial page payload grow, allowed the data to become stale, omitted custom modules, and required the search component itself to understand every domain model.

Kinesis needs one global search surface that discovers current records, searches meaningful secondary fields, ranks results consistently, and can grow without coupling the user interface to Prisma models.

## Decision

Search is a server-side application service with four layers:

1. `GET /api/search?q=...` is the transport boundary. It validates no domain details and returns uncached JSON.
2. `lib/search/engine.ts` normalizes the query, executes providers concurrently, applies consistent multi-term matching and ranking, and limits the response.
3. `lib/search/providers.ts` contains independently owned domain adapters. A provider performs a selective database query and maps records to the shared result contract.
4. `SearchBar` is only a client for the endpoint. It debounces requests, cancels superseded work, and provides loading, failure, pointer, and keyboard states.

The custom-module provider is data-driven: it queries every non-archived `CustomItem`, its module, and its dynamic fields. Creating a custom module or adding fields therefore requires no search code.

No separate index is introduced yet. PostgreSQL remains the source of truth and provider queries bound their candidate sets. This avoids synchronization failure modes while the dataset is personal-scale. The provider boundary permits a future full-text or external index without changing the API or UI.

## Result contract

Every provider returns `SearchResult` values with:

- a globally unique, namespaced `id`;
- `title` and `subtitle` for display;
- a canonical `href`;
- `keywords`, used by the engine for final multi-term matching and relevance;
- `kind` for a human-readable module label; and
- an icon category (plus optional custom icon metadata).

Keywords are internal and removed from the HTTP response. Providers must not include sensitive values that the current user may not search or view.

## Adding search to future development

1. Add a `SearchProvider` in `lib/search/providers.ts`, or place a large provider in its own file and import it into `coreSearchProviders`.
2. Push filtering into Prisma (or the module's storage adapter), set a reasonable candidate `take`, and select only fields required for mapping and ranking.
3. Include names plus useful metadata in `keywords`. The engine requires every whitespace-separated query term to match at least one keyword and boosts exact, prefix, and title matches.
4. Return stable canonical URLs. A result must remain useful when opened directly.
5. Add provider and engine tests for title, metadata, multi-term, empty-query, ranking, and result-limit behavior. Test the API contract separately from the providers.

New custom modules and their items are already covered automatically. Only a new built-in module or a new storage system needs provider registration.

## Operational and security considerations

- Queries are trimmed and capped at 100 characters; result counts are capped by both providers and the engine.
- The browser waits 180 ms and aborts stale requests. The endpoint uses `private, no-store` so edited data is visible on the next search.
- Providers run concurrently, so one slow provider affects total latency. Production telemetry should record overall and per-provider latency before choosing an index.
- When authentication is introduced, authorization must be applied inside each provider, not only at the route. This prevents results or metadata from crossing account boundaries.
- A provider currently failing rejects the whole search request. If independent infrastructure is introduced, the engine may evolve to return partial results with structured observability.

## Consequences

Search now reads fresh database state and encompasses documents, goals and milestones, finance, people and relationships, and all custom-module items and fields. The header sends no complete domain collections to the browser. The trade-off is a database request per query and an explicit provider registration step for future built-in domains.
