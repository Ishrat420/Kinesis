import { isRouteActive } from "./active-route";

/**
 * The phone tab bar's routing (KD-054): which tab a page belongs to, and
 * which of the bar's five slots that tab sits in.
 *
 * Only Home, To-dos and Calendar are routes of their own. Every other page is
 * reached through the More sheet, so More is current for all of them -- the
 * bar always shows where you are, even on a page none of its tabs names.
 */
export type TabId = "home" | "todos" | "calendar" | "more";

export const ROUTE_TABS = [
  { id: "home", href: "/" },
  { id: "todos", href: "/todos" },
  { id: "calendar", href: "/calendar" },
] as const satisfies readonly { id: TabId; href: string }[];

export function tabForPath(pathname: string | null | undefined): TabId {
  if (!pathname) return "home";
  return ROUTE_TABS.find((tab) => isRouteActive(pathname, tab.href))?.id ?? "more";
}

/** Slot 2, the centre, is the + button, which is never "current". */
const SLOTS: Record<TabId, number> = { home: 0, todos: 1, calendar: 3, more: 4 };

export function tabSlot(tab: TabId) {
  return SLOTS[tab];
}
