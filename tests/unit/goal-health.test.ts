import { describe, expect, it } from "vitest";
import { calculateGoalHealth } from "@/lib/goals/health";

const DAY_MS = 86_400_000;
const now = new Date("2026-01-01T00:00:00.000Z");
const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY_MS);
const snapshot = (value: number, dayOffset: number) => ({ value, recordedAt: daysFromNow(dayOffset) });

/** A 30-day horizon needing 70 more units, i.e. a required pace of 16.33/week. */
const baseGoal = {
  targetValue: 100,
  currentValue: 30,
  targetDate: daysFromNow(30),
  unit: "Books",
  now,
};

describe("calculateGoalHealth: cases where no health can be reported", () => {
  it("returns null once the target date has passed, since there is no pace left to hold", () => {
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(-1), history: [] })).toBeNull();
  });

  it("returns null on the target date itself, when zero days remain", () => {
    expect(calculateGoalHealth({ ...baseGoal, targetDate: now, history: [] })).toBeNull();
  });

  it("returns null when the goal is already met, so no pace is required", () => {
    expect(calculateGoalHealth({ ...baseGoal, currentValue: 100, history: [] })).toBeNull();
  });
});

describe("calculateGoalHealth: the reporting period scales with the time remaining", () => {
  it("reports a daily pace when under a fortnight remains", () => {
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(13), history: [] })?.period).toBe("day");
  });

  it("reports a weekly pace from a fortnight up to two months out", () => {
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(14), history: [] })?.period).toBe("week");
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(59), history: [] })?.period).toBe("week");
  });

  it("reports a monthly pace from two months out", () => {
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(60), history: [] })?.period).toBe("month");
    expect(calculateGoalHealth({ ...baseGoal, targetDate: daysFromNow(400), history: [] })?.period).toBe("month");
  });
});

describe("calculateGoalHealth: STAY ON TRACK when there is not enough history to measure a pace", () => {
  it("states the pace still required when the goal has no snapshots at all", () => {
    const health = calculateGoalHealth({ ...baseGoal, history: [] });

    expect(health).toMatchObject({ status: "STAY ON TRACK", tone: "neutral", actualPace: null, period: "week" });
    expect(health?.requiredPace).toBeCloseTo(70 / 30 * 7, 10);
    expect(health?.message).toBe("You need to reach about 16.3 Books/week to reach this goal.");
  });

  it("still reports no measured pace from a single snapshot, which spans no time", () => {
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(10, -14)] });

    expect(health?.status).toBe("STAY ON TRACK");
    expect(health?.actualPace).toBeNull();
  });

  it("still reports no measured pace when two snapshots share the same timestamp", () => {
    // Dividing by a zero-length window would produce an Infinite pace.
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(10, -14), snapshot(20, -14)] });

    expect(health?.status).toBe("STAY ON TRACK");
    expect(health?.actualPace).toBeNull();
  });

  it("prefixes a currency unit before the amount instead of appending it", () => {
    const health = calculateGoalHealth({ ...baseGoal, unit: "$AUD", history: [] });

    expect(health?.message).toBe("You need to reach about $AUD 16.3/week to reach this goal.");
  });

  it("omits the unit entirely when the goal has none", () => {
    const health = calculateGoalHealth({ ...baseGoal, unit: null, history: [] });

    expect(health?.message).toBe("You need to reach about 16.3/week to reach this goal.");
  });
});

describe("calculateGoalHealth: classifying a measured pace against the required pace", () => {
  it("is ON TRACK when the measured pace is within ten percent of what is required", () => {
    // 30 units over 14 days is 15/week against a required 16.33/week (ratio 0.92).
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(30, 0)] });

    expect(health).toMatchObject({ status: "ON TRACK", tone: "good", period: "week" });
    expect(health?.actualPace).toBeCloseTo(15, 10);
    expect(health?.message).toBe("Your average pace of 15 Books/week is on track.");
  });

  it("is AT RISK when the measured pace falls more than ten percent short", () => {
    // 10 units over 14 days is 5/week against a required 16.33/week (ratio 0.31).
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(10, 0)] });

    expect(health).toMatchObject({ status: "AT RISK", tone: "risk" });
    expect(health?.actualPace).toBeCloseTo(5, 10);
  });

  it("projects the value actually reachable by the target month when AT RISK", () => {
    // 30 now plus 0.714/day for the remaining 30 days lands near 51.4 books.
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(10, 0)] });

    expect(health?.message).toBe("At your current pace, you're projected to reach about 51.4 Books by January 2026.");
  });

  it("is AHEAD when the measured pace exceeds what is required by more than ten percent", () => {
    // 40 units over 14 days is 20/week against a required 16.33/week (ratio 1.22).
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(40, 0)] });

    expect(health).toMatchObject({ status: "AHEAD", tone: "good" });
    expect(health?.actualPace).toBeCloseTo(20, 10);
  });

  it("reports how many months early the goal will land when AHEAD by a month or more", () => {
    // 8,000 still to raise at 66.67/day finishes in 120 days, eight months
    // before a target date a year out.
    const health = calculateGoalHealth({
      targetValue: 12_000,
      currentValue: 4_000,
      targetDate: daysFromNow(365),
      unit: "$AUD",
      now,
      history: [snapshot(0, -60), snapshot(4_000, 0)],
    });

    expect(health?.status).toBe("AHEAD");
    expect(health?.message).toBe("You're approximately 8 months ahead.");
  });

  it("drops the months figure when AHEAD by less than a full month", () => {
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(40, 0)] });

    expect(health?.message).toBe("You're ahead of the pace needed to reach this goal.");
  });
});

describe("calculateGoalHealth: goals that count down rather than up", () => {
  it("treats falling values as forward progress when the target is below the current value", () => {
    // Paying a 10,000 debt down to zero: 2,000 repaid over 30 days is progress,
    // not a negative pace, and here it is exactly the pace required.
    const health = calculateGoalHealth({
      targetValue: 0,
      currentValue: 8_000,
      targetDate: daysFromNow(120),
      unit: "$AUD",
      now,
      history: [snapshot(10_000, -30), snapshot(8_000, 0)],
    });

    expect(health?.actualPace).toBeGreaterThan(0);
    expect(health?.status).toBe("ON TRACK");
  });

  it("marks a countdown goal AT RISK when the value is moving the wrong way", () => {
    const health = calculateGoalHealth({
      targetValue: 0,
      currentValue: 12_000,
      targetDate: daysFromNow(120),
      unit: "$AUD",
      now,
      history: [snapshot(10_000, -30), snapshot(12_000, 0)],
    });

    expect(health?.status).toBe("AT RISK");
    expect(health?.actualPace).toBeLessThan(0);
  });
});

describe("calculateGoalHealth: robustness of the history window", () => {
  it("measures from the oldest to the newest snapshot regardless of the order supplied", () => {
    const chronological = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(30, 0)] });
    const shuffled = calculateGoalHealth({ ...baseGoal, history: [snapshot(30, 0), snapshot(0, -14)] });

    expect(shuffled).toEqual(chronological);
  });

  it("uses only the endpoints of the window, so intermediate snapshots do not skew the pace", () => {
    const endpointsOnly = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(30, 0)] });
    const withMiddle = calculateGoalHealth({
      ...baseGoal,
      history: [snapshot(0, -14), snapshot(28, -7), snapshot(30, 0)],
    });

    expect(withMiddle).toEqual(endpointsOnly);
  });

  it("does not mutate the caller's history array while sorting it", () => {
    const history = [snapshot(30, 0), snapshot(0, -14)];
    const original = [...history];
    calculateGoalHealth({ ...baseGoal, history });

    expect(history).toEqual(original);
  });
});

describe("calculateGoalHealth: locale only affects the human-readable message", () => {
  it("formats the pace figure using the supplied locale", () => {
    const health = calculateGoalHealth({ ...baseGoal, targetValue: 30_000, currentValue: 0, history: [], locale: "de-DE" });

    // German grouping uses a dot where en-AU uses a comma.
    expect(health?.message).toContain("7.000");
  });

  it("names the projected month in the supplied locale", () => {
    const health = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(10, 0)], locale: "fr-FR" });

    expect(health?.message).toContain("janvier 2026");
  });

  it("leaves the machine-readable fields identical whatever the locale", () => {
    const auStatus = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(30, 0)] });
    const deStatus = calculateGoalHealth({ ...baseGoal, history: [snapshot(0, -14), snapshot(30, 0)], locale: "de-DE" });

    expect(deStatus?.status).toBe(auStatus?.status);
    expect(deStatus?.requiredPace).toBe(auStatus?.requiredPace);
    expect(deStatus?.actualPace).toBe(auStatus?.actualPace);
  });
});
