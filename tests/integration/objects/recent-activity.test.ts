import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getRecentActivity } from "@/lib/data/object-event-history";
import { updateGoalTargetDateAction } from "@/app/(app)/goals/actions";
import { createCustomItemAction } from "@/app/(app)/custom-modules/actions";

/**
 * KD-048 Phase 2: the dashboard's "Recent activity" widget now reads real,
 * per-field ObjectEvent facts across every module -- not the old flat
 * ActivityEvent log's "Added"/"Updated" sentences.
 */

const owner = "recent-activity-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function makeGoal(id: string) {
  const objectId = `${id}-object`;
  await prisma.object.create({ data: { id: objectId, type: "GOAL", name: id, userId: owner } });
  await prisma.goal.create({ data: { id, name: id, userId: owner, objectId } });
  return objectId;
}

describe.sequential("getRecentActivity (KD-048 Phase 2)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Activity", lastName: "Owner", email: "recent-activity@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("returns events across different modules, newest first, each resolved to its own module/href", async () => {
    await makeGoal("goal-1");
    await updateGoalTargetDateAction("goal-1", {}, form({ targetDate: "2030-06-01" }));

    await prisma.customModule.create({ data: { id: "module-1", userId: owner, name: "Vehicles", normalizedName: "vehicles", icon: "car", color: "#123456" } });
    await createCustomItemAction("module-1", {}, form({ name: "Truck" }));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-1", name: "Truck" } });

    const activity = await getRecentActivity();

    expect(activity).toHaveLength(2);
    // Newest first: the custom item's creation happened after the goal's target-date change.
    expect(activity[0]).toMatchObject({ objectName: "Truck", module: "Vehicles", icon: "car", href: `/custom-modules/module-1/items/${item.id}`, title: "Created" });
    expect(activity[1]).toMatchObject({ objectName: "goal-1", module: "Goals", href: "/goals/goal-1", title: "Target date set" });
  });

  it("carries the real field-level detail through, not a generic 'Updated' sentence", async () => {
    await makeGoal("goal-2");

    await updateGoalTargetDateAction("goal-2", {}, form({ targetDate: "2030-06-01" }));

    const [activity] = await getRecentActivity();
    expect(activity).toMatchObject({ title: "Target date set", detail: "To 2030-06-01" });
  });

  it("respects the limit", async () => {
    await makeGoal("goal-a");
    await makeGoal("goal-b");
    await makeGoal("goal-c");
    await updateGoalTargetDateAction("goal-a", {}, form({ targetDate: "2030-01-01" }));
    await updateGoalTargetDateAction("goal-b", {}, form({ targetDate: "2030-02-01" }));
    await updateGoalTargetDateAction("goal-c", {}, form({ targetDate: "2030-03-01" }));

    await expect(getRecentActivity(2)).resolves.toHaveLength(2);
  });

  it("never returns another account's events", async () => {
    const stranger = "recent-activity-stranger";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "recent-activity-stranger@example.test" } });
    const strangerObjectId = "stranger-goal-object";
    await prisma.object.create({ data: { id: strangerObjectId, type: "GOAL", name: "Not yours", userId: stranger } });
    await prisma.goal.create({ data: { id: "stranger-goal", name: "Not yours", userId: stranger, objectId: strangerObjectId } });
    mocks.requireKinesisUser.mockResolvedValue({ id: stranger });
    await updateGoalTargetDateAction("stranger-goal", {}, form({ targetDate: "2030-01-01" }));
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });

    await expect(getRecentActivity()).resolves.toEqual([]);

    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});
