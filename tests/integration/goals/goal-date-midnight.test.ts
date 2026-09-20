import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), getFormatPreferences: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/format/server", () => ({ getFormatPreferences: mocks.getFormatPreferences }));

import { prisma } from "@/lib/data/prisma";
import {
  addMilestoneAction,
  createGoalAction,
  updateGoalTargetDateAction,
  updateMilestoneAction,
  updateMilestoneDueDateAction,
} from "@/app/(app)/goals/actions";
import { DEFAULT_FORMAT_PREFERENCES } from "@/lib/format/preferences";

/**
 * KD-031: a goal's target date and a milestone's due date used to be pushed to
 * T23:59:59.999Z, the only date fields in the app not stored at UTC midnight.
 * These run against the real database because the point of the fix is what the
 * stored instant actually is, not just which calendar day it round-trips to.
 */

const owner = "goal-midnight-owner";
const GOAL = "goal-midnight-target";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const readGoal = (id: string) => prisma.goal.findUniqueOrThrow({ where: { id }, select: { targetDate: true } });
const readMilestone = (id: string) => prisma.milestone.findUniqueOrThrow({ where: { id }, select: { dueDate: true } });

async function makeGoal(id: string) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId: owner } });
  return prisma.goal.create({ data: { id, name: id, userId: owner, objectId: object.id } });
}

describe.sequential("goal and milestone dates are stored at UTC midnight", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    mocks.getFormatPreferences.mockResolvedValue(DEFAULT_FORMAT_PREFERENCES);
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Midnight", lastName: "Owner", email: "goal-midnight@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
  });

  it("stores a new goal's target date at midnight rather than the end of the day", async () => {
    await createGoalAction({}, form({ name: "Read more", targetDate: "2026-08-01" }));
    const goal = await prisma.goal.findFirstOrThrow({ where: { userId: owner, name: "Read more" }, select: { targetDate: true } });
    expect(goal.targetDate?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("stores a moved target date at midnight", async () => {
    await makeGoal(GOAL);
    await updateGoalTargetDateAction(GOAL, {}, form({ targetDate: "2026-09-15" }));
    expect((await readGoal(GOAL)).targetDate?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("stores a new milestone's due date at midnight", async () => {
    await makeGoal(GOAL);
    await addMilestoneAction(GOAL, {}, form({ name: "Chapter one", dueDate: "2026-07-15" }));
    const milestone = await prisma.milestone.findFirstOrThrow({ where: { goalId: GOAL }, select: { dueDate: true } });
    expect(milestone.dueDate?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("stores an edited milestone's due date at midnight", async () => {
    await makeGoal(GOAL);
    const milestone = await prisma.milestone.create({ data: { id: "milestone-midnight", goalId: GOAL, name: "Chapter one", position: 0 } });
    await updateMilestoneAction(GOAL, milestone.id, {}, form({ name: "Chapter one", dueDate: "2026-07-20" }));
    expect((await readMilestone(milestone.id)).dueDate?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("stores a milestone due date moved on its own row at midnight", async () => {
    await makeGoal(GOAL);
    const milestone = await prisma.milestone.create({ data: { id: "milestone-midnight-2", goalId: GOAL, name: "Chapter two", position: 0 } });
    await updateMilestoneDueDateAction(GOAL, milestone.id, {}, form({ dueDate: "2026-07-25" }));
    expect((await readMilestone(milestone.id)).dueDate?.toISOString()).toBe("2026-07-25T00:00:00.000Z");
  });
});
