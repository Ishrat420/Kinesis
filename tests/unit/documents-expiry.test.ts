import { describe, expect, it } from "vitest";
import { getExpiryDetails } from "@/lib/documents/expiry";

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
});
