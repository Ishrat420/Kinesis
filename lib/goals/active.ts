/**
 * "Active" as a query, so a lapsed goal stops counting the moment it lapses.
 *
 * `effectiveStatus` has always said that an Active goal whose target date has
 * passed is really Archived, but only the pages that call it -- and the handful
 * that ran their own `updateMany` first -- ever saw that. Every reminder query
 * read the stored column instead, so a goal past its target date kept its
 * milestones reminding until somebody happened to open a page that persisted
 * the change, and then a batch of reminders vanished at once on an unrelated
 * visit.
 *
 * Expressing the same rule as a `where` fixes the timing at the source: the
 * cutoff is the target date itself, so every reader agrees the moment it
 * passes, whether or not the column has caught up yet. The column still gets
 * written (see `archiveLapsedGoals`) because it is what the goal's own status
 * chip reads -- but nothing waits on it.
 */

/**
 * Goals still Active on `today`: not manually closed, and not past their target
 * date.
 *
 * `today` and `targetDate` are both UTC midnight (KD-031), so `gte`/`lt`
 * already compares whole days -- a goal targeted for today stays Active
 * through all of it, and lapses the instant tomorrow's midnight arrives.
 */
export function activeGoalWhere(today: Date) {
  return {
    status: "Active",
    OR: [{ targetDate: null }, { targetDate: { gte: today } }],
  };
}

/** The complement: manually closed, or lapsed past its target date. */
export function lapsedGoalWhere(today: Date) {
  return {
    OR: [{ status: { not: "Active" } }, { targetDate: { lt: today } }],
  };
}
