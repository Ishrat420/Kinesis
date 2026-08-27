import { describe, expect, it } from "vitest";
import { getExpiryDetails, getExpiryReminderDate } from "@/lib/documents/expiry";

describe("getExpiryDetails", () => {
  const today = new Date("2026-08-26T18:30:00.000Z");

  it("treats the exact reminder threshold as expiring soon", () => {
    const expiry = new Date("2026-09-25T03:00:00.000Z");

    expect(getExpiryDetails(expiry, 30, today)).toMatchObject({
      urgency: "soon",
      status: "Expiring soon",
    });
  });

  it("keeps dates beyond the reminder threshold safe", () => {
    const expiry = new Date("2026-09-26T03:00:00.000Z");

    expect(getExpiryDetails(expiry, 30, today)).toMatchObject({
      urgency: "safe",
      status: "Active",
    });
  });

  it("uses date-only comparisons near midnight", () => {
    const expiry = new Date("2026-09-25T23:59:59.999Z");

    expect(getExpiryDetails(expiry, 30, today).urgency).toBe("soon");
  });

  it("marks dates before today as expired", () => {
    const expiry = new Date("2026-08-25T23:59:59.999Z");

    expect(getExpiryDetails(expiry, 30, today)).toMatchObject({
      urgency: "expired",
      status: "Expired",
    });
  });

  it("uses calendar months for the six-month reminder option", () => {
    const expiry = new Date("2027-02-23T00:00:00.000Z");
    const now = new Date("2026-08-26T12:00:00.000Z");

    expect(getExpiryDetails(expiry, 180, now)).toMatchObject({
      urgency: "soon",
      status: "Expiring soon",
    });
    expect(getExpiryReminderDate(expiry, 180)).toEqual(new Date("2026-08-23T00:00:00.000Z"));
  });

  it("shows days beyond a calendar-month threshold instead of hiding them", () => {
    const expiry = new Date("2027-02-27T00:00:00.000Z");

    expect(getExpiryDetails(expiry, 180, today)).toMatchObject({
      label: "6 months, 1 day left",
      urgency: "safe",
    });
  });

  it("clamps calendar reminders to the final day of shorter months", () => {
    const expiry = new Date("2027-08-31T00:00:00.000Z");

    expect(getExpiryReminderDate(expiry, 180)).toEqual(new Date("2027-02-28T00:00:00.000Z"));
  });
});
