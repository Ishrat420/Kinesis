/**
 * The stacking order every sticky or fixed element in the shell and its pages
 * shares, so a new overlay's z-index is picked from here instead of guessed
 * per file. BUG-006 (the Relationships inspector painting above the
 * Notifications panel) was exactly this: two files each picked `z-30`
 * independently, with nothing to say which was meant to win.
 *
 * Low to high:
 *   `chrome`  -- the sticky top bar, and popovers/panels confined to a page's
 *                own layout (a calendar filter dropdown, the Relationships
 *                inspector).
 *   `banner`  -- transient dropdowns and banners that must clear chrome: the
 *                command bar's suggestions, a capture confirmation toast, a
 *                day overview.
 *   `overlay` -- a full-screen dialog and its backdrop. Prefer portaling to
 *                `document.body` here (see Modal.tsx) so no ancestor's
 *                stacking context -- chrome included -- can trap it.
 *   `top`     -- above an overlay: a confirmation raised from inside a dialog,
 *                or a toast that has to outlive the dialog it came from.
 *
 * The values only need to hold this relative order; nothing depends on the
 * numbers themselves.
 */
export const Z_INDEX = {
  chrome: "z-30",
  banner: "z-40",
  overlay: "z-50",
  top: "z-[60]",
} as const;
