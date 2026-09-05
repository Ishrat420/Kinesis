import { describe, expect, it } from "vitest";
import { activeGoalWhere, lapsedGoalWhere } from "@/lib/goals/active";
import { effectiveStatus } from "@/lib/goals/format";
import { earliestTargetDate } from "@/lib/goals/target-date";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999Z`);
const NOW = at("2026-07-01");

/** Whether a goal row would be returned by a `where`, evaluated the way Prisma would. */
function matches(where: { status?: unknown; OR?: unknown[] }, goal: { status: string; targetDate: Date | null }) {
  const clause = (part: Record<string, never> | Record<string, unknown>): boolean => {
    if ("targetDate" in part) {
      const rule = (part as { targetDate: null | { gte?: Date; lt?: Date } }).targetDate;
      if (rule === null) return goal.targetDate === null;
      if (rule.gte) return goal.targetDate !== null && goal.targetDate >= rule.gte;
      if (rule.lt) return goal.targetDate !== null && goal.targetDate < rule.lt;
    }
    if ("status" in part) {
      const rule = (part as { status: string | { not: string } }).status;
      return typeof rule === "string" ? goal.status === rule : goal.status !== rule.not;
    }
    return false;
  };
  const statusOk = where.status === undefined || goal.status === where.status;
  const orOk = where.OR === undefined || (where.OR as Record<string, unknown>[]).some(clause);
  return statusOk && orOk;
}

const active = (targetDate: Date | null) => ({ status: "Active", targetDate });

describe("activeGoalWhere: the lapse applied as a query rather than a stored column", () => {
  it("keeps a goal whose target date is still ahead", () => {
    expect(matches(activeGoalWhere(NOW), active(endOf("2026-12-31")))).toBe(true);
  });

  it("keeps a goal with no target date at all, which can never lapse", () => {
    expect(matches(activeGoalWhere(NOW), active(null))).toBe(true);
  });

  it("drops a goal whose target date has passed, even though the column still says Active", () => {
    // This is the whole point: before, the row stayed Active in the database
    // until some page happened to persist the change, and its milestones kept
    // reminding until then.
    expect(matches(activeGoalWhere(NOW), active(endOf("2026-06-30")))).toBe(false);
  });

  it("drops a goal closed by hand, whatever its target date says", () => {
    expect(matches(activeGoalWhere(NOW), { status: "Finished", targetDate: endOf("2026-12-31") })).toBe(false);
    expect(matches(activeGoalWhere(NOW), { status: "Archived", targetDate: null })).toBe(false);
  });

  it("agrees with effectiveStatus, which the goal's own status chip reads", () => {
    // Two expressions of one rule -- a `where` and a function. They are only
    // safe to keep apart while they answer identically.
    const goals = [
      active(endOf("2026-12-31")),
      active(endOf("2026-06-30")),
      active(null),
      { status: "Finished", targetDate: endOf("2026-12-31") },
    ];
    for (const goal of goals) {
      expect(matches(activeGoalWhere(NOW), goal)).toBe(effectiveStatus(goal.status, goal.targetDate, NOW) === "Active");
    }
  });

  it("holds a goal active through the whole of its target day", () => {
    // Target dates are stored at the end of the day, so the goal lapses when
    // the day is over rather than the moment it begins.
    expect(matches(activeGoalWhere(at("2026-07-01")), active(endOf("2026-07-01")))).toBe(true);
    expect(matches(activeGoalWhere(at("2026-07-02")), active(endOf("2026-07-01")))).toBe(false);
  });
});

describe("lapsedGoalWhere: the complement the engine cleans up by", () => {
  it("catches a goal that has lapsed past its target date", () => {
    expect(matches(lapsedGoalWhere(NOW), active(endOf("2026-06-30")))).toBe(true);
  });

  it("catches a goal closed by hand", () => {
    expect(matches(lapsedGoalWhere(NOW), { status: "Archived", targetDate: null })).toBe(true);
  });

  it("leaves a goal that is genuinely still active", () => {
    expect(matches(lapsedGoalWhere(NOW), active(endOf("2026-12-31")))).toBe(false);
    expect(matches(lapsedGoalWhere(NOW), active(null))).toBe(false);
  });

  it("is the exact complement of activeGoalWhere", () => {
    const goals = [
      active(endOf("2026-12-31")),
      active(endOf("2026-06-30")),
      active(null),
      { status: "Revisit Later", targetDate: endOf("2026-12-31") },
    ];
    for (const goal of goals) {
      expect(matches(lapsedGoalWhere(NOW), goal)).toBe(!matches(activeGoalWhere(NOW), goal));
    }
  });
});

describe("earliestTargetDate: how far back a target date may be pulled", () => {
  it("is the day after the furthest milestone due date", () => {
    // Normalised to a whole UTC day, which is all a date input's `min` reads.
    const milestones = [{ dueDate: endOf("2026-08-01") }, { dueDate: endOf("2026-09-15") }, { dueDate: endOf("2026-07-01") }];
    expect(earliestTargetDate(milestones)?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("is unbounded when no milestone carries a due date", () => {
    expect(earliestTargetDate([{ dueDate: null }, { dueDate: null }])).toBeNull();
  });

  it("is unbounded for a goal with no milestones", () => {
    expect(earliestTargetDate([])).toBeNull();
  });

  it("ignores undated milestones while still reading the dated ones", () => {
    expect(earliestTargetDate([{ dueDate: null }, { dueDate: endOf("2026-08-01") }])?.toISOString())
      .toBe("2026-08-02T00:00:00.000Z");
  });
});
