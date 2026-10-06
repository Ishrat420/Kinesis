/**
 * Closes whatever "big window" is open when the user navigates somewhere it
 * doesn't cover. A soft navigation keeps a parallel slot's last page when the
 * new URL doesn't match it, so without this, opening a Kinesis Link card from
 * a To-Do's or Finance Item's window moved the page underneath while the
 * window stayed on top -- the link looked dead. Matching every other route
 * here and rendering nothing is Next's documented way to clear the slot
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md,
 * "Closing the modal"). Intercepted routes beside this still win for the
 * URLs they cover, and `/` itself falls to ../default.tsx.
 */
export default function CatchAll() {
  return null;
}
