import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_UNITS, GOAL_STATUSES, displayNumber, effectiveStatus } from "@/lib/goals/format";

const now = new Date("2026-06-15T10:00:00.000Z");

describe("effectiveStatus: showing an Active goal as Archived once its target date passes", () => {
  it("archives an Active goal whose target date is in the past", () => {
    expect(effectiveStatus("Active", new Date("2026-06-14T00:00:00.000Z"), now)).toBe("Archived");
  });

  it("keeps an Active goal active while its target date is still ahead", () => {
    expect(effectiveStatus("Active", new Date("2026-06-16T00:00:00.000Z"), now)).toBe("Active");
  });

  it("keeps an Active goal active when it has no target date to expire against", () => {
    expect(effectiveStatus("Active", null, now)).toBe("Active");
  });

  it("leaves every non-Active status untouched, so a finished goal is never relabelled", () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");

    expect(effectiveStatus("Finished", pastDate, now)).toBe("Finished");
    expect(effectiveStatus("Revisit Later", pastDate, now)).toBe("Revisit Later");
    expect(effectiveStatus("Archived", pastDate, now)).toBe("Archived");
  });

  it("compares instants, so a target date earlier the same day already counts as passed", () => {
    // Target dates are stored at UTC midnight, which is behind a mid-morning
    // "now" on the same calendar day.
    expect(effectiveStatus("Active", new Date("2026-06-15T00:00:00.000Z"), now)).toBe("Archived");
  });

  it("does not archive a target date later on the same day", () => {
    expect(effectiveStatus("Active", new Date("2026-06-15T23:00:00.000Z"), now)).toBe("Active");
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
