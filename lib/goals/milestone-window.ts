import { startOfUtcDay, type DateInput } from "@/lib/dates";
import { getReminderWindowEnd } from "@/lib/reminders/policy";

/**
 * The query value that turns the milestones page's due-soon filter on.
 *
 * The dashboard tile counts a strict window -- incomplete, on an active goal,
 * due between today and the milestone lead time -- and its "See all" used to
 * land on a page listing every incomplete milestone instead, undated ones
 * included. The number never matched the list. The tile now links with this
 * filter applied, so what it counts is what the page shows.
 */
export const MILESTONE_DUE_SOON_FILTER = "due-soon";

/** Where the dashboard tile points: the list narrowed to what the tile counted. */
export const MILESTONES_DUE_SOON_HREF = `/goals/milestones/due-soon?filter=${MILESTONE_DUE_SOON_FILTER}`;

/** The same page with the filter removed: every upcoming milestone, dated or not. */
export const MILESTONES_ALL_HREF = "/goals/milestones/due-soon";

export type MilestoneDueWindow = { from: Date; to: Date };

/**
 * The window the tile counts: today through `leadDays` ahead, both ends
 * inclusive. `getMilestonesDueSoon` builds its query from this and the page
 * filters with it, so the count and the list cannot describe different sets.
 */
export function milestoneDueSoonWindow(now: DateInput, leadDays: number): MilestoneDueWindow {
  const from = startOfUtcDay(now)!;
  return { from, to: getReminderWindowEnd(from, leadDays) };
}

/**
 * Whether a milestone falls inside that window.
 *
 * An undated milestone never does -- it has no deadline to be near -- which is
 * the single biggest gap between the old list and the tile's number.
 */
export function isMilestoneDueSoon(dueDate: Date | null, window: MilestoneDueWindow) {
  return dueDate !== null && dueDate >= window.from && dueDate <= window.to;
}

/** "30 days", "1 day" -- one phrasing, so the tile and the page read alike. */
export function milestoneDueSoonLabel(leadDays: number) {
  return `${leadDays} ${leadDays === 1 ? "day" : "days"}`;
}

/**
 * The two lists the milestones page renders, and how much the filter is hiding.
 *
 * Overdue is never filtered: a milestone that has already lapsed is not
 * something a lookahead window should be able to hide, and the tile does not
 * count it either. The filter only narrows what is still ahead.
 */
export function milestoneLists<T extends { dueDate: Date | null }>(
  milestones: readonly T[],
  today: Date,
  window: MilestoneDueWindow,
  dueSoonOnly: boolean,
) {
  const overdue = milestones.filter((milestone) => milestone.dueDate !== null && milestone.dueDate < today);
  const ahead = milestones.filter((milestone) => milestone.dueDate === null || milestone.dueDate >= today);
  const upcoming = dueSoonOnly ? ahead.filter((milestone) => isMilestoneDueSoon(milestone.dueDate, window)) : ahead;

  return { overdue, upcoming, hiddenByFilter: ahead.length - upcoming.length };
}
