import { describe, expect, it } from "vitest";
import {
  MILESTONES_ALL_HREF,
  MILESTONES_DUE_SOON_HREF,
  MILESTONE_DUE_SOON_FILTER,
  isMilestoneDueSoon,
  milestoneDueSoonLabel,
  milestoneDueSoonWindow,
  milestoneLists,
} from "@/lib/goals/milestone-window";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = at("2026-06-15");
const window30 = milestoneDueSoonWindow(today, 30);

const milestone = (name: string, dueDate: string | null) => ({ name, dueDate: dueDate ? at(dueDate) : null });
const names = (milestones: { name: string }[]) => milestones.map((milestone) => milestone.name);

describe("milestoneDueSoonWindow: the span the dashboard tile counts", () => {
  it("runs from today to the lead time ahead", () => {
    expect(window30.from.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(window30.to.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("collapses to today alone when the lead is zero", () => {
    const window = milestoneDueSoonWindow(today, 0);
    expect(window.from.toISOString()).toBe(window.to.toISOString());
  });

  it("reads today in UTC, so the window never shifts with the reader's clock", () => {
    expect(milestoneDueSoonWindow(new Date("2026-06-15T23:30:00.000Z"), 30).from.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});

describe("isMilestoneDueSoon: what the tile's number is counting", () => {
  it("counts a milestone due today", () => {
    expect(isMilestoneDueSoon(at("2026-06-15"), window30)).toBe(true);
  });

  it("counts one due on the last day of the window", () => {
    expect(isMilestoneDueSoon(at("2026-07-15"), window30)).toBe(true);
  });

  it("excludes one due the day after the window closes", () => {
    expect(isMilestoneDueSoon(at("2026-07-16"), window30)).toBe(false);
  });

  it("excludes one already overdue", () => {
    expect(isMilestoneDueSoon(at("2026-06-14"), window30)).toBe(false);
  });

  it("excludes an undated milestone, which has no deadline to be near", () => {
    // The old list filed these under "Upcoming"; the tile never counted them.
    expect(isMilestoneDueSoon(null, window30)).toBe(false);
  });
});

describe("milestoneLists: what the page renders in each state", () => {
  const milestones = [
    milestone("Due today", "2026-06-15"),
    milestone("Due inside the window", "2026-07-01"),
    milestone("Due on the last day", "2026-07-15"),
    milestone("Due beyond the window", "2026-09-01"),
    milestone("No due date", null),
    milestone("Overdue", "2026-06-01"),
  ];

  it("lists only the window when the filter is on -- exactly what the tile counted", () => {
    const { upcoming } = milestoneLists(milestones, today, window30, true);
    expect(names(upcoming)).toEqual(["Due today", "Due inside the window", "Due on the last day"]);
  });

  it("lists every upcoming milestone, undated included, when the filter is off", () => {
    const { upcoming } = milestoneLists(milestones, today, window30, false);
    expect(names(upcoming)).toEqual(["Due today", "Due inside the window", "Due on the last day", "Due beyond the window", "No due date"]);
  });

  it("keeps overdue milestones in either state, since a lookahead window should not hide a lapsed one", () => {
    expect(names(milestoneLists(milestones, today, window30, true).overdue)).toEqual(["Overdue"]);
    expect(names(milestoneLists(milestones, today, window30, false).overdue)).toEqual(["Overdue"]);
  });

  it("counts what the filter is holding back, so the drop is explained rather than silent", () => {
    expect(milestoneLists(milestones, today, window30, true).hiddenByFilter).toBe(2);
    expect(milestoneLists(milestones, today, window30, false).hiddenByFilter).toBe(0);
  });

  it("puts a milestone due today under Upcoming, never Overdue", () => {
    const { upcoming, overdue } = milestoneLists([milestone("Due today", "2026-06-15")], today, window30, true);
    expect(names(upcoming)).toEqual(["Due today"]);
    expect(overdue).toEqual([]);
  });

  it("splits every milestone into exactly one section", () => {
    const { upcoming, overdue } = milestoneLists(milestones, today, window30, false);
    expect(upcoming.length + overdue.length).toBe(milestones.length);
  });
});

describe("the link the dashboard tile follows", () => {
  it("carries the filter, so See all shows what the number counted", () => {
    expect(MILESTONES_DUE_SOON_HREF).toBe(`/goals/milestones/due-soon?filter=${MILESTONE_DUE_SOON_FILTER}`);
  });

  it("drops back to the bare page when the filter is removed", () => {
    expect(MILESTONES_ALL_HREF).toBe("/goals/milestones/due-soon");
    expect(MILESTONES_DUE_SOON_HREF.startsWith(`${MILESTONES_ALL_HREF}?`)).toBe(true);
  });
});

describe("milestoneDueSoonLabel: one phrasing for the tile and the page", () => {
  it("pluralises a multi-day window", () => {
    expect(milestoneDueSoonLabel(30)).toBe("30 days");
  });

  it("keeps a single day singular", () => {
    expect(milestoneDueSoonLabel(1)).toBe("1 day");
  });

  it("describes a zero-day window as days", () => {
    expect(milestoneDueSoonLabel(0)).toBe("0 days");
  });
});
