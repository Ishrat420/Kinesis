import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), getToday: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/format/server", () => ({ getToday: mocks.getToday }));

import { prisma } from "@/lib/data/prisma";
import { archiveLapsedGoals } from "@/lib/data/goal-status";
import { syncAndGetGoals } from "@/lib/data/goals";

/**
 * BUG-002 was exactly this mechanism: a goal kept reading "Active" after its
 * status had really lapsed, because nothing had persisted the column past the
 * page that happened to trigger it. `effectiveStatus`/`activeGoalWhere` are
 * unit-tested (tests/unit/goal-lapse.test.ts) as pure predicates, but nothing
 * asserted the write side actually happens, only when it should, and scoped to
 * the right rows -- which is the one thing a pure-function test cannot see.
 * These run against the real database for that reason.
 */

const owner = "lapse-owner";
const otherOwner = "lapse-other-owner";

// `today` as `getToday` would return it: a whole UTC day, start-of-day.
const TODAY = new Date("2030-06-15T00:00:00.000Z");
// A target date is stored at the last millisecond of its day (see
// lib/goals/active.ts), so "targeted for today" is not yet lapsed.
const YESTERDAY_TARGET = new Date("2030-06-14T23:59:59.999Z");
const TODAY_TARGET = new Date("2030-06-15T23:59:59.999Z");
const FUTURE_TARGET = new Date("2030-07-01T23:59:59.999Z");

async function makeGoal(id: string, userId: string, status: string, targetDate: Date | null) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId } });
  return prisma.goal.create({ data: { id, name: id, userId, objectId: object.id, status, targetDate } });
}

const readStatus = (id: string) => prisma.goal.findUniqueOrThrow({ where: { id }, select: { status: true } }).then((goal) => goal.status);

describe.sequential("lapsed-goal auto-archiving", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    mocks.getToday.mockResolvedValue(TODAY);
    await prisma.user.deleteMany({ where: { id: { in: [owner, otherOwner] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Lapse", lastName: "Owner", email: "lapse-owner@example.test" },
        { id: otherOwner, firstName: "Lapse", lastName: "Other", email: "lapse-other@example.test" },
      ],
    });
  });

  describe("archiveLapsedGoals", () => {
    it("archives an Active goal whose target date has passed", async () => {
      await makeGoal("lapsed-active", owner, "Active", YESTERDAY_TARGET);
      const result = await archiveLapsedGoals(owner, TODAY);
      expect(result.count).toBe(1);
      expect(await readStatus("lapsed-active")).toBe("Archived");
    });

    it("does not archive a goal targeted for today -- its target date has not passed yet", async () => {
      await makeGoal("due-today", owner, "Active", TODAY_TARGET);
      await archiveLapsedGoals(owner, TODAY);
      expect(await readStatus("due-today")).toBe("Active");
    });

    it("does not archive a goal whose target date is still ahead", async () => {
      await makeGoal("due-later", owner, "Active", FUTURE_TARGET);
      await archiveLapsedGoals(owner, TODAY);
      expect(await readStatus("due-later")).toBe("Active");
    });

    it("does not archive an open-ended goal with no target date", async () => {
      await makeGoal("open-ended", owner, "Active", null);
      await archiveLapsedGoals(owner, TODAY);
      expect(await readStatus("open-ended")).toBe("Active");
    });

    it.each(["Finished", "Archived", "Revisit Later"])(
      "leaves a %s goal alone even past its target date -- only Active lapses",
      async (status) => {
        await makeGoal(`already-${status}`, owner, status, YESTERDAY_TARGET);
        await archiveLapsedGoals(owner, TODAY);
        expect(await readStatus(`already-${status}`)).toBe(status);
      },
    );

    it("only touches the given user's own goals", async () => {
      await makeGoal("someone-elses-lapsed-goal", otherOwner, "Active", YESTERDAY_TARGET);
      const result = await archiveLapsedGoals(owner, TODAY);
      expect(result.count).toBe(0);
      expect(await readStatus("someone-elses-lapsed-goal")).toBe("Active");
    });
  });

  describe("syncAndGetGoals", () => {
    it("persists the archive, not just an in-memory patch, and returns it archived", async () => {
      await makeGoal("sync-lapsed", owner, "Active", YESTERDAY_TARGET);
      const goals = await syncAndGetGoals();
      expect(goals.find((goal) => goal.id === "sync-lapsed")?.status).toBe("Archived");
      expect(await readStatus("sync-lapsed")).toBe("Archived");
    });

    it("leaves a goal that has not lapsed as Active in both the read and the database", async () => {
      await makeGoal("sync-active", owner, "Active", FUTURE_TARGET);
      const goals = await syncAndGetGoals();
      expect(goals.find((goal) => goal.id === "sync-active")?.status).toBe("Active");
      expect(await readStatus("sync-active")).toBe("Active");
    });

    it("does not archive, or return, another user's lapsed goal", async () => {
      await makeGoal("lapse-someone-elses-goal", otherOwner, "Active", YESTERDAY_TARGET);
      const goals = await syncAndGetGoals();
      expect(goals.some((goal) => goal.id === "lapse-someone-elses-goal")).toBe(false);
      expect(await readStatus("lapse-someone-elses-goal")).toBe("Active");
    });
  });
});
