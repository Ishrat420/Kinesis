import { describe, expect, it } from "vitest";
import { isOverdueReminderDue, isValidOverdueReminderInterval, NEEDS_ATTENTION_URL, OVERDUE_REMINDER_TAG, toOverdueReminderPayload } from "@/lib/push/overdue-reminder";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("when the overdue reminder goes out (KD-058)", () => {
  const due = (overdueCount: number, today: string, lastSentOn: string | null, intervalDays = 3) =>
    isOverdueReminderDue({ overdueCount, today: day(today), lastSentOn: lastSentOn ? day(lastSentOn) : null, intervalDays });

  it("never goes out with nothing overdue", () => {
    expect(due(0, "2030-01-10", null)).toBe(false);
    expect(due(0, "2030-01-10", "2030-01-01")).toBe(false);
  });

  it("goes out the first time anything is overdue", () => {
    expect(due(1, "2030-01-10", null)).toBe(true);
  });

  it("waits the whole interval after the last one, then goes out", () => {
    expect(due(2, "2030-01-04", "2030-01-02", 3)).toBe(false);
    expect(due(2, "2030-01-05", "2030-01-02", 3)).toBe(true);
    expect(due(2, "2030-01-20", "2030-01-02", 3)).toBe(true);
  });

  it("goes out daily at an interval of 1, but not twice on the same day", () => {
    expect(due(1, "2030-01-02", "2030-01-01", 1)).toBe(true);
    expect(due(1, "2030-01-02", "2030-01-02", 1)).toBe(false);
  });
});

describe("the interval Settings accepts", () => {
  it("is a whole number of days from 1 to 30", () => {
    for (const days of [1, 3, 30]) expect(isValidOverdueReminderInterval(days)).toBe(true);
    for (const days of [0, -1, 31, 2.5, Number.NaN]) expect(isValidOverdueReminderInterval(days)).toBe(false);
  });
});

describe("the overdue reminder push", () => {
  it("says how many things need attention and opens Needs Attention", () => {
    expect(toOverdueReminderPayload(4, 6)).toEqual({ title: "4 things need your attention", body: "Tap to see what's overdue.", url: NEEDS_ATTENTION_URL, tag: OVERDUE_REMINDER_TAG, badge: 6 });
    expect(toOverdueReminderPayload(1, 1).title).toBe("1 thing needs your attention");
  });
});
