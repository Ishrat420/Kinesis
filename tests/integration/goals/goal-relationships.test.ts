import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/format/server", () => ({ getFormatPreferences: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getGoalRelationships } from "@/lib/data/goals";
import {
  addGoalRelationshipAction,
  removeGoalRelationshipAction,
  updateGoalRelationshipAction,
} from "@/app/(app)/goals/actions";

/**
 * Goal relationships are stored on the shared ObjectRelationship capability and
 * addressed by object id, while the Goal module keeps talking in goal ids. These
 * run against the real database so the endpoint matching, direction and
 * ownership scoping are exercised as they actually execute.
 */

const owner = "goal-rel-owner";
const stranger = "goal-rel-stranger";

const asUser = (id: string) => mocks.requireKinesisUser.mockResolvedValue({ id });

async function makeGoal(userId: string, id: string, name: string) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name, userId } });
  return prisma.goal.create({ data: { id, name, userId, objectId: object.id } });
}

const link = async (from: string, to: string, type = "SUPPORTS") => {
  const data = new FormData();
  data.set("targetGoalId", to);
  data.set("type", type);
  return addGoalRelationshipAction(from, {}, data);
};

const retype = (goalId: string, relationshipId: string, type: string) => {
  const data = new FormData();
  data.set("type", type);
  return updateGoalRelationshipAction(goalId, relationshipId, data);
};

const onlyRelationship = () => prisma.objectRelationship.findFirstOrThrow();

describe.sequential("goal relationships over the shared Object layer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Goal", lastName: "Owner", email: "goal-owner@example.test" },
        { id: stranger, firstName: "Some", lastName: "Stranger", email: "goal-stranger@example.test" },
      ],
    });
    await makeGoal(owner, "goal-a", "Alpha");
    await makeGoal(owner, "goal-b", "Beta");
    await makeGoal(owner, "goal-c", "Gamma");
    await makeGoal(stranger, "goal-z", "Zeta");
    asUser(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("reading from either end", () => {
    it("reads a link from the source side as the forward direction", async () => {
      await link("goal-a", "goal-b", "DEPENDS_ON");

      const { linked } = await getGoalRelationships("goal-a");

      expect(linked).toHaveLength(1);
      expect(linked[0]).toMatchObject({ inverse: false, type: "DEPENDS_ON", goal: { id: "goal-b", name: "Beta" } });
    });

    it("reads the same link from the target side as the inverse direction", async () => {
      await link("goal-a", "goal-b", "DEPENDS_ON");

      const { linked } = await getGoalRelationships("goal-b");

      expect(linked).toHaveLength(1);
      expect(linked[0]).toMatchObject({ inverse: true, type: "DEPENDS_ON", goal: { id: "goal-a", name: "Alpha" } });
    });

    it("offers every other unlinked goal and never the goal being viewed", async () => {
      const before = await getGoalRelationships("goal-a");
      expect(before.availableGoals.map(({ id }) => id)).toEqual(["goal-b", "goal-c"]);

      await link("goal-a", "goal-b");

      const after = await getGoalRelationships("goal-a");
      expect(after.availableGoals.map(({ id }) => id)).toEqual(["goal-c"]);
    });

    it("keeps a goal's links to itself out of another owner's view", async () => {
      await link("goal-a", "goal-b");

      asUser(stranger);
      const { linked, availableGoals } = await getGoalRelationships("goal-a");

      expect(linked).toEqual([]);
      expect(availableGoals).toEqual([]);
    });
  });

  describe("creating links", () => {
    it("refuses to link a goal to itself without touching the database", async () => {
      await expect(link("goal-a", "goal-a")).resolves.toEqual({ error: "A goal cannot be linked to itself." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("refuses to link a goal owned by someone else", async () => {
      await expect(link("goal-a", "goal-z")).resolves.toEqual({ error: "One or more goals were not found." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("rejects a duplicate link offered from either direction", async () => {
      await expect(link("goal-a", "goal-b")).resolves.toEqual({});

      await expect(link("goal-a", "goal-b")).resolves.toEqual({ error: "These goals are already linked." });
      await expect(link("goal-b", "goal-a")).resolves.toEqual({ error: "These goals are already linked." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });

    it("stores the link against both goals' object ids", async () => {
      await link("goal-a", "goal-b");

      await expect(onlyRelationship()).resolves.toMatchObject({
        sourceObjectId: "object-goal-a",
        targetObjectId: "object-goal-b",
        userId: owner,
      });
    });
  });

  describe("editing links", () => {
    it("retypes a link from the source side", async () => {
      await link("goal-a", "goal-b", "SUPPORTS");
      const { id } = await onlyRelationship();

      await retype("goal-a", id, "BLOCKS");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "BLOCKS" });
    });

    it("retypes a link from the target side", async () => {
      await link("goal-a", "goal-b", "SUPPORTS");
      const { id } = await onlyRelationship();

      await retype("goal-b", id, "ALONGSIDE");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "ALONGSIDE" });
    });

    it("ignores a retype requested through a goal that is not an endpoint", async () => {
      await link("goal-a", "goal-b", "SUPPORTS");
      const { id } = await onlyRelationship();

      await retype("goal-c", id, "BLOCKS");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "SUPPORTS" });
    });

    it("ignores a retype requested by another owner", async () => {
      await link("goal-a", "goal-b", "SUPPORTS");
      const { id } = await onlyRelationship();

      asUser(stranger);
      await retype("goal-a", id, "BLOCKS");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "SUPPORTS" });
    });

    it("ignores an unrecognised relationship type", async () => {
      await link("goal-a", "goal-b", "SUPPORTS");
      const { id } = await onlyRelationship();

      await retype("goal-a", id, "NOT_A_TYPE");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "SUPPORTS" });
    });
  });

  describe("removing links", () => {
    it("removes a link from the source side", async () => {
      await link("goal-a", "goal-b");
      const { id } = await onlyRelationship();

      await removeGoalRelationshipAction("goal-a", id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("removes a link from the target side", async () => {
      await link("goal-a", "goal-b");
      const { id } = await onlyRelationship();

      await removeGoalRelationshipAction("goal-b", id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("ignores a removal requested through a goal that is not an endpoint", async () => {
      await link("goal-a", "goal-b");
      const { id } = await onlyRelationship();

      await removeGoalRelationshipAction("goal-c", id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });

    it("ignores a removal requested by another owner", async () => {
      await link("goal-a", "goal-b");
      const { id } = await onlyRelationship();

      asUser(stranger);
      await removeGoalRelationshipAction("goal-a", id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });
  });
});
