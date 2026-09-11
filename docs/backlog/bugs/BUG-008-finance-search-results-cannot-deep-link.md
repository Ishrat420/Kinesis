# BUG-008 — Finance search results can't deep-link to the matched item

**Status:** Open
**Priority:** Low

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
