import { describe, expect, it } from "vitest";
import { getExpiryDetails, getExpiryReminderDate, NO_REMINDER_VALUE, parseReminderPrompt, reminderFormValue, reminderLabel } from "@/lib/documents/expiry";

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

describe('"No reminders" (KD-026)', () => {
  const today = new Date("2026-08-26T00:00:00.000Z");

  it("has no reminder date", () => {
    expect(getExpiryReminderDate(new Date("2026-09-01T00:00:00.000Z"), null)).toBeNull();
  });

  it("never reads Expiring soon: Active up to and including the expiry day", () => {
    expect(getExpiryDetails(new Date("2026-08-27T00:00:00.000Z"), null, today)).toMatchObject({ urgency: "safe", status: "Active" });
    expect(getExpiryDetails(today, null, today)).toMatchObject({ urgency: "safe", status: "Active" });
  });

  it("still reads Expired once the expiry date has passed", () => {
    expect(getExpiryDetails(new Date("2026-08-25T00:00:00.000Z"), null, today)).toMatchObject({ urgency: "expired", status: "Expired" });
  });

  it("round-trips through the form's select value", () => {
    expect(reminderFormValue(null)).toBe(NO_REMINDER_VALUE);
    expect(parseReminderPrompt(NO_REMINDER_VALUE)).toBeNull();
    expect(parseReminderPrompt(reminderFormValue(90))).toBe(90);
    expect(parseReminderPrompt("999")).toBe(180);
  });

  it("reads as No reminders, and the periods as before", () => {
    expect(reminderLabel(null)).toBe("No reminders");
    expect(reminderLabel(180)).toBe("6 months before expiry");
  });
});
