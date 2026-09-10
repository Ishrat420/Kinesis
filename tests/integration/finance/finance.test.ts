import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), addActivity: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: mocks.addActivity }));

import { prisma } from "@/lib/data/prisma";
import { getFinanceItems } from "@/lib/data/finance";
import { deleteFinanceItemAction, saveFinanceItemAction } from "@/app/(app)/finance/actions";

/**
 * lib/data/finance.ts and its actions had no real-database coverage --
 * every save goes through a create-or-update branch keyed on ownership, and
 * a delete goes through the shared Object-identity cascade (deleteObjects),
 * neither of which a mocked Prisma client can actually validate.
 */

const owner = "finance-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.sequential("the finance data layer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Finance", lastName: "Owner", email: "finance-owner@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("creates an asset, its Object identity, and returns it from getFinanceItems", async () => {
    const result = await saveFinanceItemAction("asset", null, {}, form({ name: "Savings", amount: "5000", category: "Cash", rate: "2.5" }));

    expect(result).toEqual({ saved: true });
    const items = await getFinanceItems();
    expect(items).toEqual([expect.objectContaining({ kind: "asset", name: "Savings", amount: 5000, category: "Cash", rate: 2.5 })]);
    const [item] = await prisma.financeItem.findMany({ where: { userId: owner } });
    await expect(prisma.object.findUniqueOrThrow({ where: { id: item.objectId } })).resolves.toMatchObject({ type: "FINANCE_ITEM", name: "Savings", userId: owner });
  });

  it("creates a recurring income with a frequency and date range", async () => {
    await saveFinanceItemAction("income", null, {}, form({ name: "Salary", amount: "4000", frequency: "Monthly", startDate: "2026-01-01", endDate: "2026-12-31" }));

    const items = await getFinanceItems();
    expect(items).toEqual([expect.objectContaining({ kind: "income", name: "Salary", frequency: "Monthly", startDate: "2026-01-01", endDate: "2026-12-31" })]);
  });

  it("refuses a negative amount without writing anything", async () => {
    const result = await saveFinanceItemAction("asset", null, {}, form({ name: "Debt", amount: "-10" }));

    expect(result).toEqual({ error: "The amount cannot be negative." });
    await expect(getFinanceItems()).resolves.toEqual([]);
  });

  it("refuses a recurring item whose end date precedes its start date", async () => {
    const result = await saveFinanceItemAction("expense", null, {}, form({ name: "Rent", amount: "1200", frequency: "Monthly", startDate: "2026-06-01", endDate: "2026-01-01" }));

    expect(result).toEqual({ error: "The end date must be on or after the start date." });
  });

  it("updates an existing item in place rather than creating a second one", async () => {
    await saveFinanceItemAction("liability", null, {}, form({ name: "Car loan", amount: "12000" }));
    const [existing] = await prisma.financeItem.findMany({ where: { userId: owner } });

    const result = await saveFinanceItemAction("liability", existing.id, {}, form({ name: "Car loan", amount: "9000" }));

    expect(result).toEqual({ saved: true });
    await expect(prisma.financeItem.findMany({ where: { userId: owner } })).resolves.toHaveLength(1);
    await expect(prisma.financeItem.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({ amount: 9000 });
  });

  it("deletes an item and its Object identity together", async () => {
    await saveFinanceItemAction("asset", null, {}, form({ name: "Gold", amount: "100" }));
    const [item] = await prisma.financeItem.findMany({ where: { userId: owner } });

    await expect(deleteFinanceItemAction(item.id)).resolves.toEqual({ saved: true });

    await expect(prisma.financeItem.findUnique({ where: { id: item.id } })).resolves.toBeNull();
    await expect(prisma.object.findUnique({ where: { id: item.objectId } })).resolves.toBeNull();
  });

  it("never returns or deletes another account's items", async () => {
    const stranger = "finance-stranger";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "finance-stranger@example.test" } });
    mocks.requireKinesisUser.mockResolvedValue({ id: stranger });
    await saveFinanceItemAction("asset", null, {}, form({ name: "Not yours", amount: "1" }));
    const [strangerItem] = await prisma.financeItem.findMany({ where: { userId: stranger } });
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });

    await expect(getFinanceItems()).resolves.toEqual([]);
    await deleteFinanceItemAction(strangerItem.id);
    await expect(prisma.financeItem.findUnique({ where: { id: strangerItem.id } })).resolves.not.toBeNull();

    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});
