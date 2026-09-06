import "server-only";

import { cache } from "react";
import { startOfDayIn } from "@/lib/dates";
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

/**
 * The calendar day it is for the owner, as every reader on the server needs it.
 *
 * A day at UTC midnight, like every stored date -- so it drops straight into
 * the comparisons that already existed. Takes the instant rather than reading
 * the clock itself so a caller with a fixed `now` (the cron, a test) resolves
 * the same way a request does.
 */
export async function getToday(now: Date = new Date()): Promise<Date> {
  return startOfDayIn((await getFormatPreferences()).timeZone, now);
}
