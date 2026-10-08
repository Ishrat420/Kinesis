import { describe, expect, it } from "vitest";
import {
  buildRecurrence,
  followingOccurrence,
  MAX_PROJECTED_OCCURRENCES,
  nextDueAfterCompletion,
  occurrenceAt,
  occurrencesInRange,
  parseRecurringDueDateInput,
  recurrenceLabel,
  type Recurrence,
} from "@/lib/recurrence";
import { parseDateOnly } from "@/lib/dates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const rule = (r: Recurrence["rule"], start: string, days: number | null = null) => buildRecurrence(r, d(start), days);

describe("KD-055 recurrence: stepping", () => {
  it("steps weekly, fortnightly and every N days by a fixed number of days", () => {
    expect(iso(followingOccurrence(d("2026-10-08"), rule("WEEKLY", "2026-10-08")))).toBe("2026-10-15");
    expect(iso(followingOccurrence(d("2026-10-08"), rule("FORTNIGHTLY", "2026-10-08")))).toBe("2026-10-22");
    expect(iso(followingOccurrence(d("2026-10-20"), rule("EVERY_N_DAYS", "2026-10-20", 90)))).toBe("2027-01-18");
  });

  it("steps monthly by calendar month, clamped to month end and anchored back to the 31st", () => {
    const monthly = rule("MONTHLY", "2026-01-31");
    expect([1, 2, 3, 4].map((index) => iso(occurrenceAt(d("2026-01-31"), monthly, index)))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    // Stepping again from a clamped date still returns to the anchor day.
    expect(iso(followingOccurrence(d("2026-02-28"), monthly))).toBe("2026-03-31");
  });

  it("keeps 29 Feb yearly: 28 Feb in common years, 29 Feb again in leap years", () => {
    const yearly = rule("YEARLY", "2028-02-29");
    expect([1, 2, 3, 4].map((index) => iso(occurrenceAt(d("2028-02-29"), yearly, index)))).toEqual(["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("anchors only monthly and yearly rules, and keeps N only for every-N-days", () => {
    expect(buildRecurrence("MONTHLY", d("2026-01-31"), 5)).toEqual({ rule: "MONTHLY", days: null, anchorDay: 31 });
    expect(buildRecurrence("WEEKLY", d("2026-01-31"), 5)).toEqual({ rule: "WEEKLY", days: null, anchorDay: null });
    expect(buildRecurrence("EVERY_N_DAYS", d("2026-01-31"), 5)).toEqual({ rule: "EVERY_N_DAYS", days: 5, anchorDay: null });
  });

  it("labels each rule the way the dropdown does", () => {
    expect(recurrenceLabel({ rule: "FORTNIGHTLY", days: null })).toBe("Every fortnight");
    expect(recurrenceLabel({ rule: "EVERY_N_DAYS", days: 90 })).toBe("Every 90 days");
    expect(recurrenceLabel({ rule: "EVERY_N_DAYS", days: 1 })).toBe("Every 1 day");
  });
});

describe("KD-055 recurrence: completing an occurrence", () => {
  const today = d("2026-10-08");

  it("advances one step from the due date when completed early, so the schedule doesn't drift", () => {
    expect(nextDueAfterCompletion(d("2026-10-20"), rule("MONTHLY", "2026-10-20"), today)).toEqual({ next: d("2026-11-20"), skipped: 0 });
  });

  it("advances one step when that step is already today or later", () => {
    expect(nextDueAfterCompletion(d("2026-09-20"), rule("MONTHLY", "2026-09-20"), today)).toEqual({ next: d("2026-10-20"), skipped: 0 });
  });

  it("catches a long-overdue item up to the first occurrence on or after today", () => {
    expect(nextDueAfterCompletion(d("2026-06-20"), rule("MONTHLY", "2026-06-20"), today)).toEqual({ next: d("2026-10-20"), skipped: 3 });
    expect(nextDueAfterCompletion(d("2026-09-01"), rule("WEEKLY", "2026-09-01"), today)).toEqual({ next: d("2026-10-13"), skipped: 5 });
  });

  it("lands exactly on today when an occurrence falls today", () => {
    expect(nextDueAfterCompletion(d("2026-09-24"), rule("FORTNIGHTLY", "2026-09-24"), today)).toEqual({ next: d("2026-10-08"), skipped: 0 });
  });
});

describe("KD-055 recurrence: calendar projection", () => {
  it("returns every occurrence inside the window, starting from the current due date", () => {
    const weekly = rule("WEEKLY", "2026-10-08");
    expect(occurrencesInRange(d("2026-10-08"), weekly, d("2026-09-28"), d("2026-11-08")).map(iso))
      .toEqual(["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05"]);
  });

  it("never projects before the current due date", () => {
    expect(occurrencesInRange(d("2026-10-20"), rule("MONTHLY", "2026-10-20"), d("2026-09-28"), d("2026-11-08")).map(iso)).toEqual(["2026-10-20"]);
    expect(occurrencesInRange(d("2026-10-20"), rule("MONTHLY", "2026-10-20"), d("2026-08-31"), d("2026-10-11"))).toEqual([]);
  });

  it("jumps straight to a far-future window instead of walking there", () => {
    const daily = rule("EVERY_N_DAYS", "2026-10-08", 1);
    const window = occurrencesInRange(d("2026-10-08"), daily, d("9999-11-29"), d("9999-12-31"));
    expect(window).toHaveLength(33);
    expect(iso(window[0])).toBe("9999-11-29");
  });

  it("finds the right month for a monthly rule far ahead, with clamping", () => {
    expect(occurrencesInRange(d("2026-01-31"), rule("MONTHLY", "2026-01-31"), d("2030-02-01"), d("2030-03-01")).map(iso)).toEqual(["2030-02-28"]);
  });

  it("stops at the cap", () => {
    const daily = rule("EVERY_N_DAYS", "2026-01-01", 1);
    expect(occurrencesInRange(d("2026-01-01"), daily, d("2026-01-01"), d("2030-01-01"))).toHaveLength(MAX_PROJECTED_OCCURRENCES);
  });
});

describe("KD-055 recurrence: validating the form's inputs", () => {
  const parse = (value: string, recurrenceRule?: string, recurrenceDays?: string) =>
    parseRecurringDueDateInput({ value, recurrenceRule, recurrenceDays }, parseDateOnly);

  it("treats both blank as no due date", () => {
    expect(parse("", "")).toEqual({ ok: true, dueDate: null, rule: null, days: null });
  });

  it("requires the date and the rule together", () => {
    expect(parse("", "MONTHLY")).toEqual({ ok: false, error: "Enter a date for the first occurrence." });
    expect(parse("2026-10-20", "")).toEqual({ ok: false, error: "Pick how often it repeats." });
  });

  it("rejects an invalid date or an unknown rule", () => {
    expect(parse("2026-02-30", "MONTHLY")).toEqual({ ok: false, error: "Enter a valid due date." });
    expect(parse("2026-10-20", "HOURLY")).toEqual({ ok: false, error: "Pick how often it repeats." });
  });

  it("requires a whole N from 1 to 999 for every N days, and ignores N otherwise", () => {
    const error = { ok: false, error: "N must be a whole number from 1 to 999." };
    expect(parse("2026-10-20", "EVERY_N_DAYS", "")).toEqual(error);
    expect(parse("2026-10-20", "EVERY_N_DAYS", "0")).toEqual(error);
    expect(parse("2026-10-20", "EVERY_N_DAYS", "1000")).toEqual(error);
    expect(parse("2026-10-20", "EVERY_N_DAYS", "2.5")).toEqual(error);
    expect(parse("2026-10-20", "EVERY_N_DAYS", "90")).toEqual({ ok: true, dueDate: d("2026-10-20"), rule: "EVERY_N_DAYS", days: 90 });
    expect(parse("2026-10-20", "WEEKLY", "90")).toEqual({ ok: true, dueDate: d("2026-10-20"), rule: "WEEKLY", days: null });
  });
});
