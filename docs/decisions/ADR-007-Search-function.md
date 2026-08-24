# ADR-007: Global Search Function

## Status

Accepted

## Context

The original top-bar search assembled a fixed set of documents, goals, finance records, people, and relationships inside a client component. This made searchable coverage easy to forget, excluded custom modules, duplicated module knowledge in the UI, and coupled presentation to database-specific shapes.

Kinesis needs one genuinely global discovery surface. A record should be discoverable by useful metadata (including notes and custom fields), custom modules must participate without per-module wiring, and future first-party modules need a clear integration contract.

## Decision

Global search is split into three layers:

1. **Providers** translate module records into the stable `SearchEntry` contract. `lib/search/providers.ts` is the registry and the only place that knows which first-party modules participate.
2. **The engine** concurrently collects every provider into a presentation-independent index. The top bar receives this index from its Server Component, so database access remains on the server.
3. **The ranker and UI** normalize case, punctuation, and diacritics; require all query terms; score title matches above subtitle and metadata matches; and cap the displayed results. The UI owns keyboard and visual behaviour only.

The custom-module provider queries all `CustomModule` and non-archived `CustomItem` records dynamically. Consequently, every custom module—existing or created in the future—is searchable by module name, item name, notes, links, and custom field labels/values without registration or schema changes.

Search currently builds a per-render in-memory index. This is appropriate for the single-user, server-rendered application and avoids a second persistence model becoming stale. If scale requires database full-text search or an external index later, the `SearchEntry` and provider boundaries allow replacing collection/ranking without changing consumers.

## Search entry contract

Each provider returns:

* `id`: globally unique and namespaced, such as `goal:<id>`;
* `title` and `subtitle`: concise display strings;
* `href`: the most specific usable destination;
* `kind`: the result category used by the UI;
* `keywords`: undisplayed values that should be discoverable;
* optional `icon` and `color`: primarily for custom modules.

Do not put secrets or values the current user may not access in an entry. Search results are another read path and must enforce the same authorization boundary as the module page.

## Adding search to a future first-party module

1. Add its display category to `SearchResultKind` in `lib/search/types.ts` if an existing category is not suitable.
2. Implement a `SearchProvider` in `lib/search/providers.ts`. Fetch records in bulk, map them to `SearchEntry`, use stable namespaced IDs, and include meaningful fields in `keywords`.
3. Register the provider in `searchProviders`.
4. Add the category's icon/tone to `SearchBar` when introducing a new kind.
5. Verify exact-title, partial-title, multi-term, metadata, punctuation/case, no-result, keyboard, and destination-link behaviour.

User-created custom modules require none of these steps; the shared custom-module provider handles them automatically.

## Consequences

* Search coverage is explicit, centralized, testable, and independent of UI prop shapes.
* Custom modules and custom fields automatically participate.
* Multiple words may match across different indexed fields, and title matches are ranked first.
* The current index cost grows with stored records. Pagination, server-side query execution, authorization filtering, or an external search backend can be introduced behind the engine/provider contracts if data volume or multi-user requirements demand it.
