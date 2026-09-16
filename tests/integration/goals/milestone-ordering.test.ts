import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getGoal } from "@/lib/data/goals";

/**
 * KD-046: the per-goal milestone list used to order by `position` alone --
 * purely creation order -- so a milestone due in two months could sit above
 * one due in two days. getGoal() now matches the ordering
 * getMilestonesDueSoon/getActiveIncompleteMilestones already used elsewhere
 * in lib/data/goals.ts: incomplete before completed, nearest due date first
 * (undated last), position only as the final tiebreak.
 */

const owner = "milestone-ordering-owner";
const GOAL = "milestone-ordering-goal";

async function makeGoal(id: string) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId: owner } });
  return prisma.goal.create({ data: { id, name: id, userId: owner, objectId: object.id } });
}

describe.sequential("per-goal milestone ordering", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Ordering", lastName: "Owner", email: "milestone-ordering@example.test" } });
    await makeGoal(GOAL);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
  });

  it("sorts by nearest due date, not creation order, and puts completed and undated milestones last", async () => {
    // Created in an order that would previously have won: the two-months-out
    // milestone first, the two-days-out one second.
    await prisma.milestone.createMany({ data: [
      { id: "twoMonthsOut", goalId: GOAL, name: "Due in two months", dueDate: new Date("2030-03-01"), position: 0 },
      { id: "twoDaysOut", goalId: GOAL, name: "Due in two days", dueDate: new Date("2030-01-03"), position: 1 },
      { id: "alreadyDone", goalId: GOAL, name: "Already done", dueDate: new Date("2030-01-01"), completed: true, position: 2 },
      { id: "noDueDate", goalId: GOAL, name: "No due date yet", dueDate: null, position: 3 },
    ] });

    const goal = await getGoal(GOAL);
    expect(goal?.milestones.map((m) => m.id)).toEqual(["twoDaysOut", "twoMonthsOut", "noDueDate", "alreadyDone"]);
  });

  it("falls back to position for milestones sharing a due date", async () => {
    const sameDay = new Date("2030-06-01");
    await prisma.milestone.createMany({ data: [
      { id: "sameDaySecond", goalId: GOAL, name: "Added second", dueDate: sameDay, position: 1 },
      { id: "sameDayFirst", goalId: GOAL, name: "Added first", dueDate: sameDay, position: 0 },
    ] });

    const goal = await getGoal(GOAL);
    expect(goal?.milestones.map((m) => m.id)).toEqual(["sameDayFirst", "sameDaySecond"]);
  });
});
