# KD-046 — Order Milestones by Due Date, Not Creation Order

**Status:** Planning Needed  
**Priority:** Medium  
**Tags:** UX / UI

## Summary

A goal's milestone list, on the goal detail page, orders milestones by
`position` — which is simply set to the milestone count at creation time
(`app/(app)/goals/actions.ts`, `position: goal._count.milestones`). That's
insertion order and nothing else. With more than a handful of milestones on
a goal, a milestone due in two months can sit above one due in two days,
and finding "what actually needs my attention next" means reading every
row's due date instead of just reading top to bottom. Noticed directly
while using it with 10+ milestones on a goal.

The dashboard-facing milestone queries don't have this problem:
`getMilestonesDueSoon` and `getActiveIncompleteMilestones` (both in
`lib/data/goals.ts`) already order by `dueDate` first and `position` only
as a tiebreak. Only the per-goal list — `getGoal()`, same file, which feeds
`MilestoneRow` via `app/(app)/goals/[goalId]/page.tsx` — still orders by
`position` alone.

## What exists today

- `lib/data/goals.ts` `getGoal()` — `milestones: { orderBy: { position: "asc" } }`.
- `app/(app)/goals/actions.ts` — every milestone create sets
  `position: goal._count.milestones` (or the current count), so position is
  purely "when it was added," never edited afterward.
- No manual reorder UI exists for milestones today — no drag handle, unlike
  e.g. the dashboard's Module Shortcuts grid — so nothing currently depends
  on preserving creation order once it's no longer the sort key.
- `getMilestonesDueSoon` / `getActiveIncompleteMilestones` already sort
  `dueDate` ascending (nulls last) then `position` ascending — the pattern
  this ticket would bring to the per-goal list too.
- `Milestone.dueDate` is nullable in the schema, so a due-date-less
  milestone is a real case to account for, not a hypothetical.

## Leaning

Sort the per-goal milestone list the way the due-soon views already do:
by `dueDate` ascending (nulls last), `position` as the tiebreak for
same-day or no-date milestones, so nearest-due reads first. That's a
one-line `orderBy` change in `getGoal()`, following a pattern that already
exists twice elsewhere in the same file.

## Other considerations 

- **Where do completed milestones go?** It should go at the bottom of the list, if user undo the action, it should again go back to the position depending on it's due date relative to other milestone.
- **Milestones with no due date** — sort last (mirroring
  `getActiveIncompleteMilestones`'s `nulls: "last"`)
- **Does this ever need a manual override?** maybe later if flagged during usablity 

## Related

- `getMilestonesDueSoon` / `getActiveIncompleteMilestones` in
  `lib/data/goals.ts` — the existing due-date-first ordering this ticket
  would extend to the per-goal list.
