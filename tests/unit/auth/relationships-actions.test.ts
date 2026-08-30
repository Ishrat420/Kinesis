import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  tx: {
    goal: { findMany: vi.fn() },
    person: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    relationship: { deleteMany: vi.fn(), create: vi.fn() },
    activityEvent: { createMany: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveRelationshipMap } from "@/app/(app)/relationships/actions";

describe("saveRelationshipMap authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.tx) => Promise<void>) => callback(mocks.tx));
  });

  it("rejects an unowned linked goal before replacing relationship data", async () => {
    mocks.tx.goal.findMany.mockResolvedValue([{ id: "owned-goal" }]);

    await expect(saveRelationshipMap({
      people: [],
      relationships: [{
        id: "relationship-id",
        from: "person-one",
        to: "person-two",
        type: null,
        practices: [],
        reflections: [],
        linkedGoals: ["owned-goal", "another-users-goal"],
        importantDates: [],
        notes: "",
      }],
    })).rejects.toThrow("One or more linked goals were not found.");

    expect(mocks.tx.goal.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["owned-goal", "another-users-goal"] }, userId: "owner-id" },
      select: { id: true },
    });
    expect(mocks.tx.relationship.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.person.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
