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

describe("parseCapture: deadlines in long, pasted text (KD-057)", () => {
  const today = "2026-10-20"; // a Tuesday
  const read = (text: string, locale = "en-AU") => parseCapture(text, today, locale);

  it("finds 'by 12 Nov' in a chatty email and titles it from the subject", () => {
    const email = [
      "From: Coastal Insurance <hello@example.test>",
      "Sent: Monday, 19 October 2026 9:14 AM",
      "Subject: Re: Your car insurance renewal",
      "",
      "Hi Ishrat,",
      "Thanks for being with us since 3 March 2021. Your policy is coming up for renewal.",
      "Please make the payment by 12 Nov to keep your cover going.",
      "Kind regards, The Team",
    ].join("\n");
    expect(read(email)).toEqual({ title: "Your car insurance renewal", dueDate: "2026-11-12" });
  });

  it("takes the sentence with the deadline as the title when there's no subject", () => {
    const text = "Hi team, great catch-up on 2 October. Just a reminder that the forms need to be submitted before 10/23/26. Thanks!";
    expect(read(text)).toEqual({ title: "The forms need to be submitted", dueDate: "2026-10-23" });
  });

  it("reads 'before 10/23/26' month-first even under an Australian locale, since 23 can't be a month", () => {
    expect(read("Hello,\nplease send it back before 10/23/26 so we can process it.")).toMatchObject({ dueDate: "2026-10-23" });
  });

  it("counts 'by tomorrow' from when the email was sent, not from today", () => {
    const email = "Sent: Wednesday, 14 October 2026 4:02 PM\nSubject: Signed lease\n\nCould you return the signed lease by tomorrow? Thanks.";
    expect(read(email)).toEqual({ title: "Signed lease", dueDate: "2026-10-15" });
  });

  it("counts 'due by next week' from today when the text doesn't say when it was written", () => {
    expect(read("Quick note from the strata manager.\nThe levy payment is due by next week, please don't miss it.")).toMatchObject({ dueDate: "2026-10-27" });
  });

  it("prefers a strong cue ('due', 'pay by') over a weak one ('by')", () => {
    const text = "We'll be in touch by 30 October about the new plan.\nYour current invoice is due 5 November.";
    expect(read(text)).toMatchObject({ dueDate: "2026-11-05" });
  });

  it("suggests no date when equally strong deadlines disagree", () => {
    expect(read("Part one is due 5 November.\nPart two is due 19 November.")).not.toHaveProperty("dueDate");
  });

  it("ignores dates in headers, quoted replies and in passing", () => {
    const email = [
      "Sent: Monday, 19 October 2026 9:14 AM",
      "Subject: Catch up",
      "",
      "Lovely to see you on 3 October! No rush on anything.",
      "",
      "On Fri, 2 Oct 2026 at 10:00, Sam wrote:",
      "> see you then",
    ].join("\n");
    expect(read(email)).toEqual({ title: "Catch up" });
  });

  it("still takes one uncued date in a short typed capture, but not in a long message", () => {
    expect(read("call dentist tomorrow")).toMatchObject({ dueDate: "2026-10-21" });
    expect(read("We met on 3 November last year and it was lovely, really great to catch up with everyone.\nTalk soon.")).not.toHaveProperty("dueDate");
  });

  it("keeps titles from long text readable", () => {
    const long = `${"word ".repeat(60)}due by Friday`;
    const { title } = read(long);
    expect(title.length).toBeLessThanOrEqual(121);
  });
});

describe("parseCapture: real-world phrasing (KD-057)", () => {
  const today = "2026-10-22"; // a Thursday
  const read = (text: string) => parseCapture(text, today, "en-AU");

  it("reads 'by mid next week' in a long work email, titled from the ask it refers to", () => {
    const email = [
      "Hi Sam,",
      "",
      "Jo recently sent a message out to all staff regarding the yearly performance evaluations (PE). I'm attaching the template so you have visibility into what is included.",
      "",
      "Can you each take some time to consider how you think you've performed in the last 12 months. 2 topics to specifically consider:",
      "1. Areas for development",
      "2. Strengths",
      "",
      "For each of these topics, can you please send me your feedback in relation to yourself. I will try to incorporate it into what I have written.",
      "",
      "If you can get them to me by mid next week, that would be great.",
      "",
      "Thanks,",
      "Alex",
    ].join("\n");
    expect(read(email)).toEqual({ title: "Send me your feedback in relation to yourself", dueDate: "2026-10-28" });
  });

  it("knows the parts of a week chrono doesn't", () => {
    expect(read("call bank early next week")).toEqual({ title: "Call bank", dueDate: "2026-10-26" });
    expect(read("finish slides by end of this week")).toEqual({ title: "Finish slides", dueDate: "2026-10-23" });
    expect(read("book venue mid-next week")).toMatchObject({ dueDate: "2026-10-28" });
  });

  it("reads past office shorthand between the cue and the date", () => {
    expect(read("send report by COB Friday")).toEqual({ title: "Send report", dueDate: "2026-10-23" });
    expect(read("Thanks for today.\nPlease send the signed form by EOD tomorrow.")).toMatchObject({ dueDate: "2026-10-23" });
  });
});
