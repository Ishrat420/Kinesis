"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDateInput, parseDateOnly, startOfDayIn } from "@/lib/dates";
import { DEFAULT_FORMAT_PREFERENCES, type FormatPreferences } from "./preferences";

const FormatContext = createContext<FormatPreferences>(DEFAULT_FORMAT_PREFERENCES);

/**
 * Supplies regional preferences to Client Components. The application shell
 * resolves them on the server, so server and client render the same strings
 * and hydration stays stable.
 */
export function FormatProvider({
  preferences,
  children,
}: {
  preferences: FormatPreferences;
  children: React.ReactNode;
}) {
  return <FormatContext value={preferences}>{children}</FormatContext>;
}

export function useFormatPreferences(): FormatPreferences {
  return useContext(FormatContext);
}

/**
 * The owner's current day, in a Client Component.
 *
 * Read from the shared preferences rather than the browser, which is the whole
 * reason the zone travels through this provider: a component that worked the
 * day out from the machine it happens to be running on would disagree with the
 * server that rendered it, and hydrate to different text.
 */
export function useToday(): Date {
  const { timeZone } = useFormatPreferences();
  // Memoised on the day itself, so the identity is stable until the day
  // actually turns over: a fresh Date on every render would quietly defeat
  // every `useMemo` downstream that depends on today.
  const day = formatDateInput(startOfDayIn(timeZone));
  return useMemo(() => parseDateOnly(day)!, [day]);
}
