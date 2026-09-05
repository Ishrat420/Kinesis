import { describe, expect, it } from "vitest";
import { getNextOccurrence, occurrencesInRange, possessiveName } from "@/lib/relationships/occurrence";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

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

describe("occurrencesInRange: every occurrence a calendar window contains", () => {
  it("returns nothing for a one-off date outside the window", () => {
    expect(occurrencesInRange({ date: at("2026-03-01"), repeatsYearly: false }, at("2026-06-01"), at("2026-06-30"))).toEqual([]);
  });

  it("returns a one-off date that falls inside the window", () => {
    expect(occurrencesInRange({ date: at("2026-06-15"), repeatsYearly: false }, at("2026-06-01"), at("2026-06-30")).map(iso)).toEqual(["2026-06-15"]);
  });

  it("returns a one-off date that has already passed, which getNextOccurrence would not", () => {
    // A calendar window can sit wholly in the past; the date still happened.
    expect(occurrencesInRange({ date: at("2020-06-15"), repeatsYearly: false }, at("2020-06-01"), at("2020-06-30")).map(iso)).toEqual(["2020-06-15"]);
    expect(getNextOccurrence({ date: at("2020-06-15"), repeatsYearly: false }, at("2026-06-01"))).toBeNull();
  });

  it("returns a yearly date's occurrence for every year the window spans", () => {
    expect(occurrencesInRange({ date: at("1990-03-12"), repeatsYearly: true }, at("2026-01-01"), at("2028-12-31")).map(iso))
      .toEqual(["2026-03-12", "2027-03-12", "2028-03-12"]);
  });

  it("returns a yearly date's future occurrence, not only the next one", () => {
    // The bug this exists to prevent: browsing to next year's birthday and
    // finding the day bare because only the *next* occurrence was computed.
    expect(occurrencesInRange({ date: at("1990-03-12"), repeatsYearly: true }, at("2028-03-01"), at("2028-03-31")).map(iso)).toEqual(["2028-03-12"]);
  });

  it("returns a yearly date's past occurrences too", () => {
    expect(occurrencesInRange({ date: at("2026-03-12"), repeatsYearly: true }, at("2020-01-01"), at("2021-12-31")).map(iso))
      .toEqual(["2020-03-12", "2021-03-12"]);
  });

  it("excludes an occurrence in a spanned year that still falls outside the window", () => {
    expect(occurrencesInRange({ date: at("1990-03-12"), repeatsYearly: true }, at("2026-04-01"), at("2027-02-28")).map(iso)).toEqual([]);
  });

  it("includes an occurrence sitting exactly on either boundary", () => {
    expect(occurrencesInRange({ date: at("1990-03-12"), repeatsYearly: true }, at("2026-03-12"), at("2026-03-12")).map(iso)).toEqual(["2026-03-12"]);
  });

  it("ignores any time of day stored on the date", () => {
    expect(occurrencesInRange({ date: new Date("2026-06-15T13:30:00.000Z"), repeatsYearly: false }, at("2026-06-15"), at("2026-06-15")).map(iso)).toEqual(["2026-06-15"]);
  });
});
