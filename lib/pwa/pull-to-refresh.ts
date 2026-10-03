/**
 * Pull to refresh in the installed app (Safari has its own; a Home Screen
 * app doesn't): how far the spinner travels for a given drag.
 *
 * Half the finger's distance, so it feels weighted rather than glued on, and
 * capped so a long drag doesn't fling it down the page. Letting go at or past
 * the threshold refreshes.
 */
export const PULL_THRESHOLD = 72;
export const PULL_MAX = 110;

export function pullOffset(dragDistance: number) {
  if (dragDistance <= 0) return 0;
  return Math.min(PULL_MAX, dragDistance / 2);
}
