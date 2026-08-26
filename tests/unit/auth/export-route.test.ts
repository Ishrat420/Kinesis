import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const findMany = () => vi.fn().mockResolvedValue([]);
  return {
    requireKinesisUser: vi.fn().mockResolvedValue({ id: "owner-id" }),
    prisma: {
      user: { findMany: findMany() }, userSettings: { findMany: findMany() },
      document: { findMany: findMany() }, documentType: { findMany: findMany() },
      goal: { findMany: findMany() }, goalUnit: { findMany: findMany() },
      person: { findMany: findMany() }, relationship: { findMany: findMany() },
      financeItem: { findMany: findMany() }, customModule: { findMany: findMany() },
      attentionDismissal: { findMany: findMany() },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "@/app/api/settings/export/route";

describe("settings export isolation", () => {
  it("scopes every exported model to the authenticated local owner", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    for (const [name, model] of Object.entries(mocks.prisma)) {
      expect(model.findMany).toHaveBeenCalledOnce();
      if (name !== "user") {
        expect(model.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "owner-id" } });
      }
    }
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "owner-id" },
      omit: { clerkUserId: true },
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
