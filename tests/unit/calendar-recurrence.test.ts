import { describe, expect, it } from "vitest";
import { occurrencesForCadence } from "@/lib/calendar/recurrence";

describe("calendar recurrence", () => {
  it("generates only named weekdays in the visible range", () => {
    const dates = occurrencesForCadence("Every Friday", new Date("2026-01-02T00:00:00Z"), new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T23:59:59Z"));
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual(["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28"]);
  });

  it("uses the anchor day for monthly practices", () => {
    const dates = occurrencesForCadence("Monthly", new Date("2026-01-12T00:00:00Z"), new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T23:59:59Z"));
    expect(dates).toHaveLength(1);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2026-08-12");
  });
});
