# BUG-005 — Milestone tile and the page it links to disagree

**Status:** Fixed
**Priority:** Medium

## Problem

The dashboard's Milestones tile counts a strict set: incomplete milestones, on an active goal, whose due date falls between today and the milestone lead time set in Settings. Nothing before today, nothing after the window, nothing undated.

"See all" then landed on `/goals/milestones/due-soon`, which listed *every* incomplete milestone on an active goal — no window at all — with undated ones filed under "Upcoming". The number never matched the list.

The tile's label sets an expectation ("due within 30 days") and "See all" reads as "show me those ones". It showed a different, much broader set, under a heading that said "All incomplete milestones from your active goals". `/documents/expiring-soon` already respected its own window, so the two "see all" pages behaved differently as well.

## Fix

The page now has a due-soon filter, held in the URL as `?filter=due-soon`:

* **The tile links with the filter applied.** "See all" lands on exactly the set the number was counted from.
* **The filter can be removed.** The chip carries an ×, and clearing it returns the full list — every upcoming milestone, undated ones included. The unfiltered view is still reachable and unchanged.
* **Overdue is never filtered.** A lookahead window should not be able to hide a milestone that has already lapsed, and the tile does not count those either. The filter narrows only what is still ahead.
* **The misleading description is gone from the filtered view.** It reads "Milestones due in the next 30 days. Anything overdue is listed regardless." The unfiltered view keeps the original wording, which is accurate there.
* **The filter says what it is holding back.** When it hides anything, a "N more outside this window" link sits beside the chip, so the shorter list is explained rather than just shorter.

The window itself lives in `lib/goals/milestone-window.ts`. `getMilestonesDueSoon` builds its query from it and the page filters with it, so the count and the list cannot describe different sets again; `tests/unit/milestone-due-soon-agreement.test.ts` asserts the query's bounds and the page's filter select the same milestones from one fixture.

The filter is a pair of links rather than client state, which is what lets the tile point straight at the filtered view while the page stays a Server Component.
