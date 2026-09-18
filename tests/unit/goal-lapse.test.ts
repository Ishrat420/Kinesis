import { describe, expect, it } from "vitest";
import { activeGoalWhere } from "@/lib/goals/active";
import { earliestTargetDate } from "@/lib/goals/target-date";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("activeGoalWhere: purely the stored column (KD-028 removed the date-based lapse)", () => {
  it("is exactly status: Active, with no date comparison at all", () => {
    expect(activeGoalWhere()).toEqual({ status: "Active" });
  });

  it("takes no arguments -- there is no 'today' left to be given", () => {
    expect(activeGoalWhere.length).toBe(0);
  });
});

describe("earliestTargetDate: how far back a target date may be pulled", () => {
  it("is the day after the furthest milestone due date", () => {
    // Normalised to a whole UTC day, which is all a date input's `min` reads.
    const milestones = [{ dueDate: at("2026-08-01") }, { dueDate: at("2026-09-15") }, { dueDate: at("2026-07-01") }];
    expect(earliestTargetDate(milestones)?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("is unbounded when no milestone carries a due date", () => {
    expect(earliestTargetDate([{ dueDate: null }, { dueDate: null }])).toBeNull();
  });

  it("is unbounded for a goal with no milestones", () => {
    expect(earliestTargetDate([])).toBeNull();
  });

  it("ignores undated milestones while still reading the dated ones", () => {
    expect(earliestTargetDate([{ dueDate: null }, { dueDate: at("2026-08-01") }])?.toISOString())
      .toBe("2026-08-02T00:00:00.000Z");
  });
});
