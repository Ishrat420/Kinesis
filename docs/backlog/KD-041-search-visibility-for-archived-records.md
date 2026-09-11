# KD-041 — Search Visibility for Archived Records

**Status:** Planning Needed
**Priority:** Medium
**Tags:** UX / UI, Data Model

## Summary

Search is inconsistent about archived records, and not on purpose. Documents
include them; custom items exclude them; goals include every status,
including `Archived`.

```text
⌘K "passport"

Documents  → shown, archived or not (no filter at all)
Custom items → hidden once archived ("CustomItem"."archived" = false)
Goals      → shown regardless of status, status named in the subtitle
```

You archive an expired passport to get it out of the way, then ⌘K
"passport" and it's back — not because search is broken, but because
Documents never filtered it out to begin with. A custom item in the same
situation would have stayed hidden. Neither behaviour was chosen; they
just never had to agree with each other until now.

Every other archived-aware surface (Needs Attention, Upcoming & Due, the
Calendar) deliberately excludes archived records, because they're
"what needs you right now" surfaces. Search is a different kind of tool —
"find something I know I own" — and initial instinct is that hiding
archived records there works against that: **you should be able to find
everything.** This ticket is to think that through properly and write the
decision down, rather than "fixing" the inconsistency by guessing which
side is right.

## What exists today

* `lib/search/providers.ts` — the `documents` provider's SQL narrowing has
  no `archived` condition at all, so an archived document ranks and
  displays exactly like an active one.
* The `custom-modules` provider's item query explicitly adds
  `"CustomItem"."archived" = false`, so an archived custom item is
  invisible to search no matter how well it matches.
* The `goals` provider filters on nothing status-related — a `Finished`,
  `Revisit Later`, or `Archived` goal is as findable as an `Active` one —
  and already writes the status into the display subtitle
  (`` `${goal.status} goal` ``), which is the closest thing search has
  today to surfacing this to the person searching.
* The `SearchEntry` contract (`lib/search/types.ts`) has no structured
  field for "is this archived / what's its status" — Goals' subtitle is
  free text, not something a consuming UI could style differently.

## Leaning

Make everything findable, on purpose, everywhere: search stops excluding
archived records at all (closing the gap by dropping the custom-item
filter, not by adding one to Documents), while Needs Attention, Upcoming &
Due, and the Calendar keep filtering archived records out, since their job
is specifically "what's current." That split — search finds everything you
own, the other surfaces show only what still needs you — is worth writing
down explicitly once agreed, so it isn't rediscovered as a bug report
again.

If archived records are going to sit next to active ones in the same
result list, they need to say so: add a visible **Active/Archived
indicator** to the search result row, rather than leaving the person to
notice from context (or not notice, which is the whole current problem in
reverse).

## Open questions

* **One vocabulary across two data shapes.** Documents and custom items
  use a boolean `archived` column; goals use a `status` string where
  `Archived` is one value among four. A shared "status chip" needs a
  single concept to render, so this needs deciding: a normalised
  `archived: boolean` on every `SearchEntry`, a richer `status?: string`,
  or something that can represent both cleanly.
* **Where the indicator lives.** A small pill beside the kind icon, folded
  into the subtitle the way Goals already does it, or just visual
  treatment (dimmed row, sorted after active results) — these have
  different implications for how much this needs the ranker's involvement
  versus just the result row's markup.
* **Ranking.** If archived records are included, should they still be
  outranked by an active record with a weaker text match, so an exact-title
  archived hit doesn't bury a partial-match active one? Or does relevance
  stay purely text-based and the indicator is the only signal?
* **Does this reach further than these three providers?** To-Dos don't
  have a search provider yet (ADR-009 predates one), but will eventually —
  does a completed To-Do get the same treatment as an archived document? Is
  there any record type where "find it anyway" genuinely isn't wanted, or
  is "search finds everything, other surfaces filter" meant to be a hard
  rule for every current and future provider?

## Related

* ADR-007 — Global Search Function; defines the `SearchEntry`/`SearchProvider`
  contract this would extend, and the provider registry both changes above
  would touch.
* Needs Attention, Upcoming & Due, and the Calendar's existing
  archived-exclusion behaviour, which this ticket deliberately leaves
  unchanged.
