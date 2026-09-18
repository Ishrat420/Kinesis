import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_UNITS, GOAL_STATUSES, displayNumber, isGoalOverdue } from "@/lib/goals/format";

const now = new Date("2026-06-15T10:00:00.000Z");

describe("isGoalOverdue: a display-only fact, not a status change (KD-028)", () => {
  it("is overdue once an Active goal's target date is in the past", () => {
    expect(isGoalOverdue("Active", new Date("2026-06-14T00:00:00.000Z"), now)).toBe(true);
  });

  it("is not overdue while an Active goal's target date is still ahead", () => {
    expect(isGoalOverdue("Active", new Date("2026-06-16T00:00:00.000Z"), now)).toBe(false);
  });

  it("is never overdue with no target date to have passed", () => {
    expect(isGoalOverdue("Active", null, now)).toBe(false);
  });

  it("is never overdue for a status other than Active -- it was already resolved, by hand", () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");

    expect(isGoalOverdue("Finished", pastDate, now)).toBe(false);
    expect(isGoalOverdue("Revisit Later", pastDate, now)).toBe(false);
    expect(isGoalOverdue("Archived", pastDate, now)).toBe(false);
  });

  it("compares instants, so a target date earlier the same day already counts as passed", () => {
    // Target dates are stored at UTC midnight, which is behind a mid-morning
    // "now" on the same calendar day.
    expect(isGoalOverdue("Active", new Date("2026-06-15T00:00:00.000Z"), now)).toBe(true);
  });

  it("is not overdue for a target date later on the same day", () => {
    expect(isGoalOverdue("Active", new Date("2026-06-15T23:00:00.000Z"), now)).toBe(false);
  });

  it("recognises every status the application offers", () => {
    expect(GOAL_STATUSES).toEqual(["Active", "Revisit Later", "Finished", "Archived"]);
  });
});

describe("displayNumber: rendering a goal value beside its free-text unit", () => {
  it("puts a currency-style unit in front of the amount", () => {
    expect(displayNumber(1250, "$AUD")).toBe("$AUD 1,250");
    expect(displayNumber(1250, "$USD")).toBe("$USD 1,250");
  });

  it("puts a plain unit after the amount", () => {
    expect(displayNumber(12, "Books")).toBe("12 Books");
    expect(displayNumber(42, "Km")).toBe("42 Km");
  });

  it("renders the bare number when the goal has no unit", () => {
    expect(displayNumber(500)).toBe("500");
    expect(displayNumber(500, null)).toBe("500");
    expect(displayNumber(500, "")).toBe("500");
  });

  it("groups thousands and keeps at most two decimal places", () => {
    expect(displayNumber(1_234_567.891, "Km")).toBe("1,234,567.89 Km");
    expect(displayNumber(0.5, "Kg")).toBe("0.5 Kg");
  });

  it("renders negative values with the sign attached to the number", () => {
    expect(displayNumber(-250, "$AUD")).toBe("$AUD -250");
    expect(displayNumber(-250, "Km")).toBe("-250 Km");
  });

  it("uses the supplied locale's grouping and decimal separators", () => {
    expect(displayNumber(1_234.5, "Km", "de-DE")).toBe("1.234,5 Km");
    expect(displayNumber(1_234.5, "Km", "en-US")).toBe("1,234.5 Km");
  });

  it("offers currency-prefixed and plain units side by side in the defaults", () => {
    expect(DEFAULT_GOAL_UNITS).toContain("$AUD");
    expect(DEFAULT_GOAL_UNITS).toContain("Books");
  });
});
