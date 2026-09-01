import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_RELATIONSHIP_TYPES, goalPairKey, relationshipLabel } from "@/lib/goals/relationships";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  goalFindMany: vi.fn(),
  relationshipCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: {
  goal: { findMany: mocks.goalFindMany },
  objectRelationship: { create: mocks.relationshipCreate },
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/format/server", () => ({ getFormatPreferences: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { addGoalRelationshipAction } from "@/app/(app)/goals/actions";

describe("typed goal relationships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "user-one" });
    mocks.goalFindMany.mockResolvedValue([{ id: "goal-a", objectId: "object-a" }, { id: "goal-b", objectId: "object-b" }]);
    mocks.relationshipCreate.mockResolvedValue({});
  });

  it("provides the curated forward and inverse vocabulary", () => {
    expect(GOAL_RELATIONSHIP_TYPES).toEqual(["SUPPORTS", "BLOCKS", "DEPENDS_ON", "RELATES_TO", "ALONGSIDE"]);
    expect(relationshipLabel("SUPPORTS")).toBe("Supports");
    expect(relationshipLabel("SUPPORTS", true)).toBe("Supported by");
    expect(relationshipLabel("BLOCKS", true)).toBe("Blocked by");
    expect(relationshipLabel("DEPENDS_ON", true)).toBe("Required for");
    expect(relationshipLabel("RELATES_TO", true)).toBe("Related to");
    expect(relationshipLabel("ALONGSIDE", true)).toBe("Alongside");
  });

  it("uses the same pair key regardless of direction", () => {
    expect(goalPairKey("goal-a", "goal-b")).toBe(goalPairKey("goal-b", "goal-a"));
  });

  it("prevents self-links before querying or writing", async () => {
    const data = new FormData(); data.set("targetGoalId", "goal-a"); data.set("type", "SUPPORTS");
    await expect(addGoalRelationshipAction("goal-a", {}, data)).resolves.toEqual({ error: "A goal cannot be linked to itself." });
    expect(mocks.goalFindMany).not.toHaveBeenCalled();
    expect(mocks.relationshipCreate).not.toHaveBeenCalled();
  });

  it("stores an owned relationship with a direction-independent uniqueness key", async () => {
    const data = new FormData(); data.set("targetGoalId", "goal-b"); data.set("type", "DEPENDS_ON");
    await expect(addGoalRelationshipAction("goal-a", {}, data)).resolves.toEqual({});
    expect(mocks.goalFindMany).toHaveBeenCalledWith({ where: { userId: "user-one", id: { in: ["goal-a", "goal-b"] } }, select: { id: true, objectId: true } });
    expect(mocks.relationshipCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceObjectId: "object-a", targetObjectId: "object-b", type: "DEPENDS_ON", pairKey: goalPairKey("object-a", "object-b") }) });
  });

  it("turns the unique constraint into a duplicate-link error", async () => {
    mocks.relationshipCreate.mockRejectedValue({ code: "P2002" });
    const data = new FormData(); data.set("targetGoalId", "goal-b"); data.set("type", "SUPPORTS");
    await expect(addGoalRelationshipAction("goal-a", {}, data)).resolves.toEqual({ error: "These goals are already linked." });
  });
});
