/**
 * The responsive vocabulary the application shell and its pages share.
 *
 * Kinesis is laid out for one column of content that narrows with the viewport
 * rather than for a set of per-page breakpoints, so the shell owns the page
 * padding and pages supply content only. Everything here exists so that
 * decision is written down once and can be checked, instead of being re-guessed
 * in every module.
 */

/**
 * The page padding every route inherits from the application shell.
 *
 * Modules must not restate it: a page that adds its own horizontal padding
 * double-indents on one breakpoint and not another, which is exactly the drift
 * this constant is here to prevent.
 */
export const PAGE_PADDING = "px-4 sm:px-6 md:px-10";

/** The narrowest viewport Kinesis lays out for -- a small phone in portrait. */
export const NARROWEST_VIEWPORT = 320;

/**
 * How much room a page actually has at {@link NARROWEST_VIEWPORT}, once the
 * shell's `px-4` (16px a side) is taken off. Anything wider than this cannot
 * fit, and pushes the whole page into a horizontal scroll.
 */
export const NARROWEST_CONTENT_WIDTH = NARROWEST_VIEWPORT - 2 * 16;

/**
 * The width the fixed tracks of a CSS grid template add up to, in pixels.
 *
 * Only absolute tracks count: `1fr`, `auto` and `minmax()` all give way when
 * the viewport does, while a pixel track does not, so a template's pixel total
 * is the narrowest it can ever be drawn. Returns 0 for a template with no fixed
 * track at all.
 */
export function fixedTrackWidth(template: string) {
  const tracks = template.match(/(\d+(?:\.\d+)?)px/g) ?? [];
  return tracks.reduce((total, track) => total + Number.parseFloat(track), 0);
}

/**
 * Whether a grid template can be drawn at {@link NARROWEST_VIEWPORT} without
 * overflowing. A template that cannot belongs behind a breakpoint, with a
 * stacked layout underneath it.
 */
export function fitsNarrowestViewport(template: string) {
  return fixedTrackWidth(template) <= NARROWEST_CONTENT_WIDTH;
}
