import { describe, expect, it } from "vitest";
import { ALL_CALENDAR_SOURCES, CALENDAR_SOURCE_LABELS, DEFAULT_CALENDAR_SOURCES, isDefaultSourceSelection } from "@/lib/calendar/filters";
import type { CalendarSourceType } from "@/lib/calendar/types";

describe("which calendar sources a person starts with", () => {
  it("offers every source in the filter panel, reminders included", () => {
    expect(ALL_CALENDAR_SOURCES).toContain("REMINDER");
    expect(Object.keys(CALENDAR_SOURCE_LABELS)).toHaveLength(ALL_CALENDAR_SOURCES.length);
  });

  it("starts with reminders hidden, so lead-up pins do not crowd out the deadlines", () => {
    expect(DEFAULT_CALENDAR_SOURCES).not.toContain("REMINDER");
  });

  it("starts with every other source shown", () => {
    expect(DEFAULT_CALENDAR_SOURCES).toEqual(ALL_CALENDAR_SOURCES.filter((source) => source !== "REMINDER"));
  });
});

describe("isDefaultSourceSelection: when the filter button should look touched", () => {
  it("reads an untouched calendar as unfiltered, even though a source is off", () => {
    // A count-based check would mark this as filtered on every first load.
    expect(isDefaultSourceSelection(new Set(DEFAULT_CALENDAR_SOURCES))).toBe(true);
  });

  it("reads reminders switched on as a change", () => {
    expect(isDefaultSourceSelection(new Set(ALL_CALENDAR_SOURCES))).toBe(false);
  });

  it("reads a source switched off as a change", () => {
    expect(isDefaultSourceSelection(new Set(DEFAULT_CALENDAR_SOURCES.filter((source) => source !== "DOCUMENT")))).toBe(false);
  });

  it("reads swapping one source for another as a change, not as the default", () => {
    // Same size as the default, different membership: a size-only check would
    // call this untouched.
    const swapped = new Set<CalendarSourceType>(DEFAULT_CALENDAR_SOURCES.filter((source) => source !== "DOCUMENT"));
    swapped.add("REMINDER");
    expect(swapped.size).toBe(DEFAULT_CALENDAR_SOURCES.length);
    expect(isDefaultSourceSelection(swapped)).toBe(false);
  });

  it("reads an empty selection as a change", () => {
    expect(isDefaultSourceSelection(new Set())).toBe(false);
  });
});
