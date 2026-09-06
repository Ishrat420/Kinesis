import { describe, expect, it } from "vitest";
import { formatDateInput, formatDeadline, startOfDayIn, startOfUtcDay } from "@/lib/dates";
import { getTodoNotificationCandidate, getMilestoneNotificationCandidate } from "@/lib/notifications/engine";
import { activeGoalWhere, lapsedGoalWhere } from "@/lib/goals/active";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { DEFAULT_TIME_ZONE, isSupportedTimeZone, resolveFormatPreferences } from "@/lib/format/preferences";

/**
 * 9am on Wednesday 7 January 2026 in Sydney is still Tuesday the 6th in UTC.
 * Every symptom in the bug report lives in that gap, so every test here is
 * anchored to it: the old `startOfUtcDay(new Date())` answered "the 6th" for a
 * third of each day.
 */
const NINE_AM_SYDNEY = new Date("2026-01-06T22:00:00.000Z");
const SYDNEY = "Australia/Sydney";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("startOfDayIn", () => {
  it("gives the owner's day where UTC still says yesterday", () => {
    expect(formatDateInput(startOfDayIn(SYDNEY, NINE_AM_SYDNEY))).toBe("2026-01-07");
    expect(formatDateInput(startOfUtcDay(NINE_AM_SYDNEY)!)).toBe("2026-01-06");
  });

  it("agrees with UTC for an owner who is on it", () => {
    expect(startOfDayIn("UTC", NINE_AM_SYDNEY)).toEqual(day("2026-01-06"));
  });

  it("gives the day back at UTC midnight, the way every stored date is held", () => {
    const today = startOfDayIn(SYDNEY, NINE_AM_SYDNEY);
    expect(today.getUTCHours()).toBe(0);
    expect(today.getTime()).toBe(day("2026-01-07").getTime());
  });

  /**
   * Sydney moves to UTC+11 in October. Going through `Intl` rather than adding
   * a fixed offset is what makes this a non-event.
   */
  it("follows the zone across a daylight saving change", () => {
    // 10:30am on 5 April 2026, the morning the clocks go back: +11 until 3am.
    expect(formatDateInput(startOfDayIn(SYDNEY, new Date("2026-04-04T23:30:00.000Z")))).toBe("2026-04-05");
    // Mid-winter, +10.
    expect(formatDateInput(startOfDayIn(SYDNEY, new Date("2026-07-01T14:30:00.000Z")))).toBe("2026-07-02");
  });

  it("falls back to UTC rather than throwing on a zone this runtime rejects", () => {
    expect(startOfDayIn("Mars/Olympus_Mons", NINE_AM_SYDNEY)).toEqual(day("2026-01-06"));
  });
});

describe("what the owner sees at 9am", () => {
  const today = startOfDayIn(SYDNEY, NINE_AM_SYDNEY);
  const wasToday = startOfUtcDay(NINE_AM_SYDNEY)!;

  /** "A To-Do due today isn't 'due' yet." */
  it("calls a to-do due today due, instead of staying silent until mid-morning", () => {
    const todo = { id: "t", name: "Renew rego", dueDate: day("2026-01-07"), status: "TODO" as const };
    expect(getTodoNotificationCandidate(todo, today)).toMatchObject({ type: "TODO_DUE", message: "Renew rego is due today" });
    expect(getTodoNotificationCandidate(todo, wasToday)).toBeNull();
  });

  /** "'1 day overdue' reads as 'due today'." */
  it("counts a milestone that lapsed yesterday as overdue, not as due today", () => {
    const milestone = { id: "m", name: "Draft", dueDate: day("2026-01-06"), goal: { id: "g", name: "Book" } };
    expect(getMilestoneNotificationCandidate(milestone, today, 0)?.message).toBe("Draft is 1 day overdue");
    expect(getMilestoneNotificationCandidate(milestone, wasToday, 0)?.message).toBe("Draft is due today");
  });

  it("expires a document on the morning after its date, not the morning after that", () => {
    expect(getExpiryDetails(day("2026-01-06"), 30, today).status).toBe("Expired");
    expect(getExpiryDetails(day("2026-01-06"), 30, wasToday).status).toBe("Expiring soon");
  });

  it("reads a deadline in whole days from the owner's day", () => {
    expect(formatDeadline(day("2026-01-07"), today)).toBe("due today");
    expect(formatDeadline(day("2026-01-06"), today)).toBe("1 day overdue");
  });

  /**
   * Not in the report, but the same root cause: a target date is stored at the
   * last millisecond of its day, so comparing it against the clock kept a goal
   * Active through the small hours of the following local day.
   */
  it("lapses a goal whose target date was yesterday where the owner is", () => {
    const targetDate = new Date("2026-01-06T23:59:59.999Z");
    expect(targetDate >= today).toBe(false);
    expect(targetDate >= NINE_AM_SYDNEY).toBe(true);
    expect(activeGoalWhere(today).OR).toContainEqual({ targetDate: { gte: today } });
    expect(lapsedGoalWhere(today).OR).toContainEqual({ targetDate: { lt: today } });
  });
});

describe("the stored preference", () => {
  it("defaults to the zone matching the locale and currency defaults", () => {
    expect(DEFAULT_TIME_ZONE).toBe(SYDNEY);
    expect(resolveFormatPreferences({}).timeZone).toBe(SYDNEY);
  });

  it.each([
    ["a real zone", "Europe/London", true],
    ["UTC", "UTC", true],
    ["nonsense", "Mars/Olympus_Mons", false],
    ["an empty value", "", false],
    ["a non-string", 42, false],
  ])("accepts or refuses %s", (_label, value, expected) => {
    expect(isSupportedTimeZone(value)).toBe(expected);
  });
});
