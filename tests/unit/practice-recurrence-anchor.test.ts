import { describe, expect, it } from "vitest";
import { occurrencesForCadence, practiceAnchor } from "@/lib/calendar/recurrence";
import { PRACTICE_CADENCES, isPracticeCadence } from "@/lib/relationships";

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);
const days = (dates: Date[]) => dates.map((date) => date.toISOString().slice(0, 10));

// January 2026: the 4th is a Sunday, the 7th a Wednesday.
const START = utc("2026-01-01");
const END = utc("2026-02-28");

describe("practiceAnchor", () => {
  it("prefers the stated anchor over the row's creation date", () => {
    expect(practiceAnchor({ anchorDate: utc("2026-01-04"), createdAt: utc("2026-06-30") })).toEqual(utc("2026-01-04"));
  });

  /**
   * Rows written before the column existed have no anchor, and `createdAt` is
   * the day they have in fact been recurring from -- so it stays the fallback
   * rather than the schedule silently emptying out.
   */
  it("falls back to the creation date for a row that predates the column", () => {
    expect(practiceAnchor({ anchorDate: null, createdAt: utc("2026-06-30") })).toEqual(utc("2026-06-30"));
  });
});

describe("occurrencesForCadence", () => {
  it("puts a weekly practice on the anchor's weekday, every week", () => {
    const dates = days(occurrencesForCadence("Weekly", utc("2026-01-04"), START, utc("2026-01-31")));
    expect(dates).toEqual(["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25"]);
  });

  /**
   * The reason the anchor had to become a real column: this same practice used
   * to follow whatever day its row was last written on, so editing the map on a
   * Wednesday moved a Sunday walk to Wednesdays.
   */
  it("does not follow the anchor's weekday once the anchor moves", () => {
    const sunday = days(occurrencesForCadence("Weekly", utc("2026-01-04"), START, utc("2026-01-18")));
    const wednesday = days(occurrencesForCadence("Weekly", utc("2026-01-07"), START, utc("2026-01-18")));
    expect(sunday).toEqual(["2026-01-04", "2026-01-11", "2026-01-18"]);
    expect(wednesday).toEqual(["2026-01-07", "2026-01-14"]);
  });

  it("skips a week for a fortnightly practice", () => {
    const dates = days(occurrencesForCadence("Fortnightly", utc("2026-01-04"), START, utc("2026-02-15")));
    expect(dates).toEqual(["2026-01-04", "2026-01-18", "2026-02-01", "2026-02-15"]);
  });

  /** "every two weeks" contains "week": read as weekly it would happen twice as often. */
  it("does not mistake a fortnightly phrasing for a weekly one", () => {
    expect(days(occurrencesForCadence("Every two weeks", utc("2026-01-04"), START, utc("2026-01-18"))))
      .toEqual(["2026-01-04", "2026-01-18"]);
  });

  it("puts a monthly practice on the anchor's date", () => {
    expect(days(occurrencesForCadence("Monthly", utc("2026-01-11"), START, END)))
      .toEqual(["2026-01-11", "2026-02-11"]);
  });

  it("never runs a practice before its anchor", () => {
    expect(occurrencesForCadence("Daily", utc("2026-02-26"), START, END)).toHaveLength(3);
  });

  /** Every option the form offers has to produce occurrences -- that was bug #7. */
  it.each(PRACTICE_CADENCES)("understands the %s option the form offers", (cadence) => {
    expect(isPracticeCadence(cadence)).toBe(true);
    expect(occurrencesForCadence(cadence, utc("2026-01-04"), START, END).length).toBeGreaterThan(0);
  });

  it("still produces nothing for a phrasing it cannot read", () => {
    expect(occurrencesForCadence("Twice a month", utc("2026-01-04"), START, END)).toEqual([]);
    expect(isPracticeCadence("Twice a month")).toBe(false);
  });
});
