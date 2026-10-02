/**
 * Where the top bar's back button goes (the installed iPhone app has no
 * browser back): the page above this one, or null on a main section, which
 * the tab bar and More sheet already reach.
 */
const MAIN_SECTIONS = [
  /^\/$/,
  /^\/(todos|calendar|documents|finance|goals|relationships|settings)$/,
  /^\/custom-modules\/[^/]+$/,
];

/** Path prefixes that are only part of a longer URL, never a page themselves. */
const NOT_PAGES = [/^\/goals\/milestones$/, /^\/custom-modules$/, /^\/custom-modules\/[^/]+\/items$/];

/** Clerk's profile page owns everything under /user; the whole of it sits below Home. */
const PROFILE = /^\/user(\/|$)/;

export function parentPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (MAIN_SECTIONS.some((section) => section.test(path))) return null;
  if (PROFILE.test(path)) return "/";

  let parent = path;
  do {
    parent = parent.slice(0, parent.lastIndexOf("/")) || "/";
  } while (parent !== "/" && NOT_PAGES.some((pattern) => pattern.test(parent)));
  return parent;
}
