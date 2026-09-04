import { addUtcDays } from "@/lib/dates";

/**
 * The earliest target date a goal's existing milestones leave available.
 *
 * Every milestone due date has to stay strictly before the goal's target, so
 * pulling the target back past the furthest one would leave the goal in a state
 * its own forms refuse to create. The date input is bounded by this and the
 * action re-checks it, since a bound in the markup is a convenience, not a rule.
 */
export function earliestTargetDate(milestones: readonly { dueDate: Date | null }[]) {
  const latest = milestones.reduce<Date | null>((furthest, { dueDate }) => (
    dueDate && (!furthest || dueDate > furthest) ? dueDate : furthest
  ), null);
  return latest ? addUtcDays(latest, 1) : null;
}
