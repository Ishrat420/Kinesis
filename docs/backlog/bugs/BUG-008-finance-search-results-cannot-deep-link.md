# BUG-008 — Finance search results can't deep-link to the matched item

**Status:** Fixed
**Priority:** Low

## Fix

**Option 1 — scroll-to anchor, matching To-Dos.**

Each Finance row (`FinanceDashboard.tsx`'s `ItemSection`) now carries
`id={`finance-${item.id}`}` and a `scroll-mt-24` class, the same pattern
`TodoBoard.tsx` already uses (`id={`todo-${todo.id}`}`). The `finance`
search provider's `href` (`lib/search/providers.ts`) now points at
`/finance#finance-${item.id}` instead of the flat `/finance`.

Deliberately the cheaper option, not 2 or 3: it lands you on the row rather
than opening it for editing, but it's a two-line change reusing an
established pattern rather than teaching `FinanceDashboard.tsx` (a client
component with no query-param handling today) to read a search param and
call `openForm` on mount. If searching Finance to *edit* something turns out
to be the common case rather than just confirming it exists, option 2 or 3
is still open — this doesn't foreclose them, it just doesn't do the extra
work speculatively.

Covered by `tests/integration/search/search.test.ts` ("links a finance
search result to its own row, not just the Finance page"), red/green
verified against the old `href: "/finance"` before landing.

### Follow-up: the anchor still didn't scroll, for an unrelated reason

After landing the above, reported as "search works but anchor-scroll to the
row does not work" — a second, independent bug, not a symptom of the first.

Root cause: `app/(app)/finance/page.tsx` renders behind
`app/(app)/finance/loading.tsx`. Next's own hash-to-element scroll
(`layout-router.js`'s `ScrollAndFocusHandler`) runs as soon as the
`loading.tsx` fallback mounts — before `getFinanceItems()` resolves and the
real rows exist — finds no element with the matching id, and falls back to
scrolling the loading skeleton into view instead (a no-op, since it's
already at the top). Critically, it then clears `focusAndScrollRef.hashFragment`
regardless of whether it found the real target, so the retry that would
otherwise happen when the real content streams in and re-renders never
happens — the one attempt is spent on the fallback and never repeated.

This is undocumented in the bundled Next 16 docs (checked, per AGENTS.md,
before assuming any behavior) and isn't specific to Finance — any route
with both a `loading.tsx` and a `#id`-anchored search result is exposed to
it, `/todos#todo-${id}` included, whenever the underlying data fetch is
slow enough for the fallback to actually paint. Confirmed with an isolated
Next 16.2.9 + Turbopack reproduction outside Clerk auth (sticky header +
`loading.tsx` + a deliberately slow data fetch): `window.scrollY` stayed
`0` and the target row's viewport position was `2297px`, i.e. no scroll
happened at all, even though the element existed a moment later.

Fixed with a client-side fallback in `FinanceDashboard.tsx`: a mount-only
`useEffect` reads `window.location.hash` and calls
`document.getElementById(hash)?.scrollIntoView()` itself once the real
component (never the `loading.tsx` fallback) has actually mounted with its
rows in the DOM. Re-verified against the same isolated reproduction with
the equivalent effect added: the target row landed exactly at its
`scroll-mt` offset (96px, just under the sticky header) instead of not
scrolling at all.

Not fixed here, and worth its own ticket if it turns out to matter:
`/todos#todo-${id}` shares the identical `loading.tsx` + hash-anchor shape
and is exposed to the same race — it just hasn't been reported, most likely
because `getTodos()` resolves fast enough in practice that the fallback
rarely actually paints. No code change made to `TodoBoard.tsx` — this ticket
is scoped to Finance, matching what was reported.

## Problem

Every Finance entry's search result shares one static `href`: `/finance`.
`lib/search/providers.ts`'s `finance` provider builds each `SearchEntry`
with `href: "/finance"` regardless of which item matched — unlike every
other provider in the same file, which points at the specific record:
`/documents/${document.id}`, `/goals/${goal.id}`,
`/custom-modules/${item.module.id}/items/${item.id}`, or
`/todos#todo-${todo.id}`.

## Impact

Searching for a Finance item by name and clicking the result never takes
you to that item — it lands on the general Finance page, and the item
still has to be found by eye among however many assets, liabilities,
income, and expense rows are on it.

This is worse than it looks at first, because Finance items are edited
through a client-side modal (`FinanceDashboard.tsx`'s `setEditing(item)`),
not a route, and each row carries no DOM id either — so there is currently
no mechanism at all to land on a specific Finance item, not even a
scroll-to anchor the way To-Dos get one (`/todos#todo-${todo.id}`). Fixing
the search `href` alone is not enough; the Finance page itself has nothing
yet for a link to point at.

## Reproduction

1. Create a handful of Finance items (say, an asset called "Emergency
   fund" among several others).
2. Press ⌘K / Ctrl+K and search "Emergency fund".
3. Click the result.
4. Observe: the Finance page opens at the top, exactly as if you had
   navigated there directly — no indication of which item you searched
   for, no scroll, nothing highlighted, no modal opened.

## Possible solutions

None of these are implemented; picking one is unresolved.

1. **Scroll-to anchor, matching To-Dos.** Give each row a DOM id
   (`id={`finance-${item.id}`}`) and change the search `href` to
   `/finance#finance-${item.id}`, with a `scroll-mt` class the way
   `TodoBoard.tsx`'s rows already do. Cheapest option, and consistent with
   an existing pattern in the app — but only scrolls to and doesn't open
   the item, so the person still has to click Edit themselves.
2. **Open the edit modal directly**, via a query param (`/finance?edit=<id>`)
   that `FinanceDashboard.tsx` reads on mount to call
   `openForm(item.kind, item)` itself. Matches the actual destination
   someone searching for a specific item almost certainly wants (to look
   at or change it), but requires the client component to read and act on
   a search param, which nothing in Finance does today.
3. **Do both** — anchor-scroll to the row and surface an obvious "Edit"
   affordance right there, rather than auto-opening a modal the person
   didn't ask to open.

Option 2 (or 3) is the more useful outcome for someone searching, but
option 1 is the smaller change and matches an already-established pattern
in the codebase; worth weighing against how often Finance search is
actually used to jump to one item versus just to confirm it exists.

## Related

* ADR-007 — Global Search Function; defines the `SearchEntry` contract
  every other provider's `href` already follows correctly.
* `app/(app)/todos/TodoBoard.tsx` — the scroll-to-anchor pattern option 1
  would reuse.
