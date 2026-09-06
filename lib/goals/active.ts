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
 * `today` is a day at UTC midnight, in the owner's zone -- not an instant. A
 * target date is stored at the last millisecond of its day, so comparing it
 * against the clock kept a goal alive through the small hours of the following
 * local day: on UTC+10 a goal targeted the 7th stayed Active until 10am on the
 * 8th. Comparing days answers the question that was actually being asked.
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
