import type { CalendarSourceType } from "./types";

export const CALENDAR_SOURCE_LABELS: Record<CalendarSourceType, string> = {
  GOAL: "Goals",
  MILESTONE: "Milestones",
  DOCUMENT: "Documents",
  RELATIONSHIP: "Relationships",
  REMINDER: "Reminders",
  CUSTOM_OBJECT: "Custom modules",
};

export const ALL_CALENDAR_SOURCES = Object.keys(CALENDAR_SOURCE_LABELS) as CalendarSourceType[];

/**
 * The sources a calendar starts with: everything except reminders.
 *
 * Now that a reminder is derived rather than read from an already-fired
 * notification, every dated record grows a second pin a lead time earlier --
 * roughly doubling what a month holds. A month cell renders three items before
 * collapsing the rest into "+N more", so leaving reminders on by default would
 * push the deadlines themselves out of view. The chip is still there for
 * anyone who wants to see the run-up.
 */
export const DEFAULT_CALENDAR_SOURCES = ALL_CALENDAR_SOURCES.filter((source) => source !== "REMINDER");

/**
 * Whether a selection is still the default one.
 *
 * The filter button's "you have changed something" dot is drawn from this
 * rather than from a count: with reminders off by default, counting selected
 * sources would mark an untouched calendar as filtered.
 */
export function isDefaultSourceSelection(sources: ReadonlySet<CalendarSourceType>) {
  return sources.size === DEFAULT_CALENDAR_SOURCES.length && DEFAULT_CALENDAR_SOURCES.every((source) => sources.has(source));
}
