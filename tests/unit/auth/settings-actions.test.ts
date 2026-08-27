import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRecentVerification: vi.fn(),
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  securityCreate: vi.fn(() => Promise.resolve({})),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireRecentVerification: mocks.requireRecentVerification, requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    notification: { deleteMany: mocks.deleteMany }, attentionDismissal: { deleteMany: mocks.deleteMany },
    document: { deleteMany: mocks.deleteMany }, documentType: { deleteMany: mocks.deleteMany },
    relationshipGoal: { deleteMany: mocks.deleteMany }, relationship: { deleteMany: mocks.deleteMany },
    person: { deleteMany: mocks.deleteMany }, goal: { deleteMany: mocks.deleteMany },
    goalUnit: { deleteMany: mocks.deleteMany }, customModule: { deleteMany: mocks.deleteMany },
    financeItem: { deleteMany: mocks.deleteMany }, userSettings: { deleteMany: mocks.deleteMany },
    activityEvent: { deleteMany: mocks.deleteMany }, securityEvent: { create: mocks.securityCreate },
    $transaction: mocks.transaction,
  },
}));

import { DELETE_ALL_CONFIRMATION, deleteAllDataAction } from "@/app/settings/actions";

describe("delete all data security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRecentVerification.mockResolvedValue(true);
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.transaction.mockResolvedValue([]);
  });

  it("does not delete when recent verification is required", async () => {
    const challenge = { clerk_error: { reason: "reverification-error" } };
    mocks.requireRecentVerification.mockResolvedValue(challenge);

    await expect(deleteAllDataAction(DELETE_ALL_CONFIRMATION)).resolves.toBe(challenge);
    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("enforces the confirmation phrase on the server", async () => {
    await expect(deleteAllDataAction("yes")).resolves.toEqual({ error: "Enter the confirmation phrase exactly as shown." });
    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records a content-free security event in the deletion transaction", async () => {
    await expect(deleteAllDataAction(DELETE_ALL_CONFIRMATION)).resolves.toEqual({ success: true });
    expect(mocks.securityCreate).toHaveBeenCalledWith({ data: { event: "ALL_DATA_DELETED", userId: "owner-id" } });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
