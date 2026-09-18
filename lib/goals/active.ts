/**
 * "Active" as a query: exactly the stored column, nothing computed from the
 * target date.
 *
 * This used to also drop a goal the instant its target date passed, before
 * anything had persisted that as a status change -- deliberately, so a
 * lapsed goal's milestones stopped reminding immediately rather than lagging
 * behind whichever page next happened to archive it. That silent
 * archive-on-read is gone (KD-028): a goal now only ever stops being Active
 * because someone said so, through Change status. Being overdue is a fact
 * about the target date, not a status -- see `isGoalOverdue` -- so a goal
 * past its target, left Active, keeps reminding through its milestones,
 * keeps counting toward Goals at risk, and keeps its calendar pins, exactly
 * as before it lapsed. Only the display layer (a red "Overdue" chip and
 * border) notices the difference.
 */
export function activeGoalWhere() {
  return { status: "Active" };
}
