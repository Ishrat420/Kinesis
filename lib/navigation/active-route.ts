/**
 * Route matching used by navigation surfaces to decide which entry represents
 * the page the user is currently on.
 *
 * A navigation entry stays active for its own route and everything nested under
 * it, so `/documents/expiring-soon` keeps "Documents" highlighted. The dashboard
 * (`/`) is the exception: it only matches itself, otherwise every route would
 * light it up.
 */
export function isRouteActive(pathname: string | null | undefined, href: string) {
  if (!pathname) return false;

  const currentPath = normalise(pathname);
  const targetPath = normalise(href);

  if (targetPath === "/") return currentPath === "/";

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function normalise(path: string) {
  const [pathWithoutQuery] = path.split(/[?#]/);
  const trimmed = pathWithoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
