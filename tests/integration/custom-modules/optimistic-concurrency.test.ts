import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createCustomItemAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";

/**
 * BUG-007: a save conditioned only on the item's id, not on the `updatedAt`
 * it was read at, silently overwrote whatever another tab (or a long-open
 * one) had changed in between -- a lost update. These run the real
 * `updateCustomItemAction` against a real database.
 */

const owner = "occ-custom-item-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.sequential("updateCustomItemAction: optimistic concurrency", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Occ", lastName: "Owner", email: "occ-custom-item-owner@example.test" } });
    await prisma.customModule.create({ data: { id: "occ-module", userId: owner, name: "Gear", normalizedName: "gear", icon: "star", color: "#111111" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  async function makeItem() {
    await createCustomItemAction("occ-module", {}, form({ name: "Tent" }));
    return prisma.customItem.findFirstOrThrow({ where: { moduleId: "occ-module" } });
  }

  it("refuses a save whose expected updatedAt no longer matches the row", async () => {
    const item = await makeItem();
    // Someone else's save, or an earlier save from the same owner in
    // another tab -- either way, the row has moved on since `item` was read.
    await prisma.customItem.update({ where: { id: item.id }, data: { archived: true } });

    const result = await updateCustomItemAction("occ-module", item.id, {}, form({ name: "Tent renamed", updatedAt: item.updatedAt.toISOString() }));
    expect(result).toEqual({ error: "This item was changed elsewhere. Reload to see the latest version before saving again.", conflict: true });
    await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ name: "Tent", archived: true });
  });

  it("saves cleanly and returns a fresh updatedAt when the expected stamp still matches", async () => {
    const item = await makeItem();
    const result = await updateCustomItemAction("occ-module", item.id, {}, form({ name: "Tent renamed", updatedAt: item.updatedAt.toISOString() }));
    expect(result.error).toBeUndefined();
    expect(result.conflict).toBeUndefined();
    expect(result.updatedAt).toBeTruthy();
    await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ name: "Tent renamed" });
  });

  it("refuses a missing or unparseable updatedAt without writing anything", async () => {
    const item = await makeItem();
    const result = await updateCustomItemAction("occ-module", item.id, {}, form({ name: "Tent renamed" }));
    expect(result).toEqual({ error: "This item could not be identified. Reload and try again." });
    await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ name: "Tent" });
  });
});
