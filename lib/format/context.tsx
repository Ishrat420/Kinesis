"use client";

import { createContext, useContext } from "react";
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
