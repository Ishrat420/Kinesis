import "server-only";

import { cache } from "react";
import { getSettings } from "@/lib/data/settings";
import {
  DEFAULT_FORMAT_PREFERENCES,
  resolveFormatPreferences,
  type FormatPreferences,
} from "./preferences";

/**
 * Reads the owner's regional preferences for the current request.
 *
 * Formatting must never be the reason a page fails to render, so an
 * unauthenticated or otherwise unreadable state falls back to the defaults.
 */
export const getFormatPreferences = cache(async (): Promise<FormatPreferences> => {
  try {
    return resolveFormatPreferences(await getSettings());
  } catch {
    return DEFAULT_FORMAT_PREFERENCES;
  }
});
