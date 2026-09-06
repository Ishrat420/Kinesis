/**
 * A goal's measure -- its target value, current value and unit -- is optional,
 * and everything measured hangs off it: a milestone's value is expressed in the
 * goal's unit, auto-completion compares that value against the goal's current
 * value, and goal health reads the pair against the target date. Nothing stores
 * a copy of the unit, so a milestone value outliving the measure is not merely
 * stale, it is unreadable: a bare number with nothing to say what it counts.
 *
 * Removing the measure is therefore a cascade, and this module is the vocabulary
 * the two ends of it share. The page counts the affected milestones to decide
 * whether to ask first; the action counts them again to decide whether it may
 * proceed without having been asked.
 */

/** Milestones carrying a value in the goal's measure, whatever their status. */
export const milestonesUsingMeasure = <T extends { value: number | null }>(milestones: readonly T[]) =>
  milestones.filter((milestone) => milestone.value !== null);

/**
 * What the cascade costs, in the words the confirmation asks in. "Active and
 * inactive" is deliberate: a completed or overdue milestone loses its value
 * too, and a dialog that named only the visible ones would understate this.
 */
export const MEASURE_REMOVAL_CONSEQUENCE =
  "This measure is used by one or more milestones. Removing it from the goal will also remove it from all active and inactive milestones.";

/** The same warning as one sentence, for surfaces without room for a dialog. */
export const MEASURE_REMOVAL_CONFIRMATION = `Are you sure? ${MEASURE_REMOVAL_CONSEQUENCE}`;
