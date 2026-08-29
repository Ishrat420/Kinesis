import { describe, expect, it } from "vitest";
import {
  addUtcDays,
  formatActivityTime,
  formatAgendaDate,
  formatCalendarDate,
  formatDate,
  formatDateInput,
  formatDeadline,
  formatExpiry,
  formatFutureDate,
  formatMonthHeading,
  formatTime,
  parseDateOnly,
} from "@/lib/dates";

describe("universal date language", () => {
  it("formats absolute dates with an unpadded day", () => {
    expect(formatDate("2026-11-12")).toBe("12 Nov 2026");
    expect(formatDate("2026-11-02")).toBe("2 Nov 2026");
  });

  it("rejects invalid date-only values", () => {
    expect(parseDateOnly("2026-02-29")).toBeNull();
    expect(() => formatDate("not-a-date")).toThrow(RangeError);
  });

  it("provides stable date values for forms and date keys", () => {
    expect(formatDateInput("2026-02-03")).toBe("2026-02-03");
    expect(formatDateInput(new Date("2026-02-03T23:59:59.000Z"))).toBe("2026-02-03");
    expect(formatDateInput(addUtcDays("2026-03-01", -1))).toBe("2026-02-28");
    expect(() => addUtcDays("2026-03-01", 0.5)).toThrow(RangeError);
  });

  it("uses consistent deadline language", () => {
    const now = "2026-11-12";
    expect(formatDeadline("2026-11-24", now)).toBe("12 days left");
    expect(formatDeadline("2026-11-13", now)).toBe("1 day left");
    expect(formatDeadline(now, now)).toBe("due today");
    expect(formatDeadline("2026-11-11", now)).toBe("1 day overdue");
    expect(formatDeadline("2026-11-09", now)).toBe("3 days overdue");
  });

  it("uses calendar-aware future and expiry language", () => {
    expect(formatFutureDate("2027-02-12", "2026-11-12")).toBe("in 3 months");
    expect(formatExpiry("2026-11-12", "2026-11-12")).toBe("expires today");
    expect(formatExpiry("2026-11-09", "2026-11-12")).toBe("3 days expired");
    expect(formatExpiry("2027-02-13", "2026-11-12")).toBe("3 months, 1 day left");
  });

  it("provides named calendar and time variants", () => {
    expect(formatMonthHeading("2026-11-12")).toBe("November 2026");
    expect(formatAgendaDate("2026-11-12")).toBe("Thu 12 November");
    expect(formatCalendarDate("2026-11-12")).toBe("Thursday 12 November 2026");
    expect(formatTime("09:30")).toBe("9:30 am");
  });

  it("uses readable activity labels and restores the year for older activity", () => {
    const now = new Date("2026-11-12T12:00:00.000Z");
    expect(formatActivityTime(new Date("2026-11-12T11:57:00.000Z"), now)).toBe("3 minutes ago");
    expect(formatActivityTime(new Date("2026-11-02T12:00:00.000Z"), now)).toBe("2 Nov 2026");
  });
});
