import { describe, expect, it } from "vitest";
import { getNextOccurrence, possessiveName } from "@/lib/relationships/occurrence";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("getNextOccurrence: a yearly date always has a next occurrence", () => {
  it("stays on this year's date while it is still ahead", () => {
    expect(getNextOccurrence({ date: at("2020-06-15"), repeatsYearly: true }, at("2026-01-01"))?.toISOString())
      .toBe("2026-06-15T00:00:00.000Z");
  });

  it("rolls forward to next year the moment this year's date passes", () => {
    expect(getNextOccurrence({ date: at("2020-06-15"), repeatsYearly: true }, at("2026-06-16"))?.toISOString())
      .toBe("2027-06-15T00:00:00.000Z");
  });

  it("treats the day itself as this year's occurrence, not yet passed", () => {
    expect(getNextOccurrence({ date: at("2020-06-15"), repeatsYearly: true }, at("2026-06-15"))?.toISOString())
      .toBe("2026-06-15T00:00:00.000Z");
  });

  it("uses the month and day from the original date, not the year it was created", () => {
    expect(getNextOccurrence({ date: at("1990-12-25"), repeatsYearly: true }, at("2026-01-01"))?.toISOString())
      .toBe("2026-12-25T00:00:00.000Z");
  });
});

describe("getNextOccurrence: a one-off date has a next occurrence only until it passes", () => {
  it("is its own next occurrence while still ahead", () => {
    expect(getNextOccurrence({ date: at("2026-06-15"), repeatsYearly: false }, at("2026-01-01"))?.toISOString())
      .toBe("2026-06-15T00:00:00.000Z");
  });

  it("is still next on the day itself", () => {
    expect(getNextOccurrence({ date: at("2026-06-15"), repeatsYearly: false }, at("2026-06-15"))?.toISOString())
      .toBe("2026-06-15T00:00:00.000Z");
  });

  it("has no next occurrence once it has passed -- it never resurfaces a year later", () => {
    expect(getNextOccurrence({ date: at("2026-06-15"), repeatsYearly: false }, at("2026-06-16"))).toBeNull();
  });
});

describe("possessiveName: wording for reminder titles", () => {
  it("adds 's for a name that doesn't already end in s", () => {
    expect(possessiveName("Alice")).toBe("Alice's");
  });

  it("adds a bare apostrophe for a name that already ends in s", () => {
    expect(possessiveName("Chris")).toBe("Chris'");
  });

  it("is case-insensitive when checking the trailing s", () => {
    expect(possessiveName("THOMAS")).toBe("THOMAS'");
  });
});
