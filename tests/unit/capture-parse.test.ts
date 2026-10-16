import { afterEach, describe, expect, it } from "vitest";
import { parseCapture } from "@/lib/capture/parse";

/** A Friday, so "Friday" and "tomorrow" have fixed answers. */
const TODAY = "2026-10-16";
const parse = (text: string, locale = "en-AU", today = TODAY) => parseCapture(text, today, locale);

describe("parseCapture: KD-057 quick capture", () => {
  it("turns the owner's example into a title and a due date", () => {
    expect(parse("need to make a dr's appt by Sept 24th")).toEqual({
      title: "Make a dr's appt",
      dueDate: "2027-09-24",
      rolledToNextYear: true,
    });
  });

  it("keeps a date still ahead this year in this year", () => {
    expect(parse("renew rego by 30 November")).toEqual({ title: "Renew rego", dueDate: "2026-11-30" });
  });

  it("keeps a date written with its year as written, past or not", () => {
    expect(parse("tax return due 31/10/2026")).toEqual({ title: "Tax return", dueDate: "2026-10-31" });
    expect(parse("look up the 2025 invoice from 1 March 2025")).toMatchObject({ dueDate: "2025-03-01" });
  });

  it("reads relative dates forward from today", () => {
    expect(parse("call dentist tomorrow")).toEqual({ title: "Call dentist", dueDate: "2026-10-17" });
    expect(parse("file tax in 2 weeks")).toEqual({ title: "File tax", dueDate: "2026-10-30" });
    expect(parse("pay water bill by Friday")).toEqual({ title: "Pay water bill", dueDate: "2026-10-16" });
    expect(parse("dentist end of month")).toEqual({ title: "Dentist", dueDate: "2026-10-31" });
  });

  it("doesn't call a weekday near new year 'rolled over'", () => {
    // 30 Dec 2026 is a Wednesday; the next Friday is 1 Jan 2027.
    expect(parse("pay rent Friday", "en-AU", "2026-12-30")).toEqual({ title: "Pay rent", dueDate: "2027-01-01" });
  });

  it("reads numeric dates the way the owner writes them", () => {
    expect(parse("renew rego 3/11", "en-AU")).toMatchObject({ dueDate: "2026-11-03" });
    expect(parse("renew rego 3/11", "en-US")).toMatchObject({ dueDate: "2027-03-11", rolledToNextYear: true });
  });

  it("reads 'dec 20' as 20 December, not December 2020", () => {
    expect(parse("book flights dec 20")).toEqual({ title: "Book flights", dueDate: "2026-12-20" });
  });

  it("sets no date for a bare time, a month without a day, a range, or two dates", () => {
    expect(parse("book flights 3pm")).toEqual({ title: "Book flights 3pm" });
    expect(parse("plan the May trip")).toEqual({ title: "Plan the May trip" });
    expect(parse("leave from March 3 to March 10")).toEqual({ title: "Leave from March 3 to March 10" });
    expect(parse("move dentist from Monday to Friday")).not.toHaveProperty("dueDate");
  });

  it("sets no date for 31 February", () => {
    expect(parse("something on 31/02")).not.toHaveProperty("dueDate");
  });

  it("leaves a title with no date alone, apart from filler and capitalisation", () => {
    expect(parse("call mum")).toEqual({ title: "Call mum" });
    expect(parse("remind me to buy 2 tickets")).toEqual({ title: "Buy 2 tickets" });
    expect(parse("  I need to   sort the garage  ")).toEqual({ title: "Sort the garage" });
  });

  it("keeps the whole text as the title when the date was all there was", () => {
    expect(parse("tomorrow")).toEqual({ title: "Tomorrow", dueDate: "2026-10-17" });
  });

  it("returns nothing for empty text", () => {
    expect(parse("   ")).toEqual({ title: "" });
  });
});

describe("parseCapture is unaffected by the device's time zone", () => {
  const original = process.env.TZ;
  afterEach(() => { process.env.TZ = original; });

  for (const zone of ["Australia/Sydney", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    it(`gives the same dates in ${zone}`, () => {
      process.env.TZ = zone;
      expect(parse("call dentist tomorrow")).toEqual({ title: "Call dentist", dueDate: "2026-10-17" });
      expect(parse("need to make a dr's appt by Sept 24th")).toMatchObject({ dueDate: "2027-09-24" });
      expect(parse("pay water bill by Friday")).toMatchObject({ dueDate: "2026-10-16" });
    });
  }
});
