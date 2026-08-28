import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const findMany = () => vi.fn().mockResolvedValue([]);
  return {
    requireKinesisUser: vi.fn().mockResolvedValue({ id: "owner-id" }),
    requireRecentVerificationResponse: vi.fn().mockResolvedValue(true),
    prisma: {
      user: { findMany: findMany() }, userSettings: { findMany: findMany() },
      document: { findMany: findMany() }, documentType: { findMany: findMany() },
      goal: { findMany: findMany() }, goalUnit: { findMany: findMany() },
      person: { findMany: findMany() }, relationship: { findMany: findMany() },
      financeItem: { findMany: findMany() }, customModule: { findMany: findMany() },
      attentionDismissal: { findMany: findMany() },
      securityEvent: { create: vi.fn().mockResolvedValue({}) },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser, requireRecentVerificationResponse: mocks.requireRecentVerificationResponse }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "@/app/api/settings/export/route";

describe("settings export isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes every exported model to the authenticated local owner", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    for (const [name, model] of Object.entries(mocks.prisma) as [string, { findMany?: ReturnType<typeof vi.fn> }][]) {
      if (name === "securityEvent") continue;
      expect(model.findMany).toHaveBeenCalledOnce();
      if (name !== "user") {
        expect(model.findMany!.mock.calls[0][0]).toMatchObject({ where: { userId: "owner-id" } });
      }
    }
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "owner-id" },
      omit: { clerkUserId: true },
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.prisma.securityEvent.create).toHaveBeenCalledWith({ data: { event: "DATA_EXPORT_COMPLETED", userId: "owner-id" } });
  });

  it("returns Clerk's challenge response without reading or logging data", async () => {
    mocks.requireRecentVerificationResponse.mockResolvedValueOnce(new Response("challenge", { status: 403 }));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.securityEvent.create).not.toHaveBeenCalled();
  });
});
