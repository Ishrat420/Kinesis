import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), addActivity: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: mocks.addActivity }));

import { prisma } from "@/lib/data/prisma";
import { getFinanceItem } from "@/lib/data/finance";
import { saveFinanceItemAction } from "@/app/(app)/finance/actions";

/** KD-048 Phase 1 remainder: a Finance Item's own field changes enter the ObjectEvent history. */

const owner = "finance-history-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a Finance Item's own history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Finance", lastName: "Owner", email: "finance-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("records ITEM_CREATED for a new item", async () => {
    await saveFinanceItemAction("asset", null, {}, form({ name: "Savings", amount: "1000" }));
    const item = await prisma.financeItem.findFirstOrThrow({ where: { userId: owner, name: "Savings" } });

    await expect(eventsOn(item.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("records FIELD_CHANGED only for the columns that actually changed", async () => {
    await saveFinanceItemAction("asset", null, {}, form({ name: "Savings", amount: "1000", category: "Cash" }));
    const item = await prisma.financeItem.findFirstOrThrow({ where: { userId: owner, name: "Savings" } });

    await saveFinanceItemAction("asset", item.id, {}, form({ name: "Savings", amount: "2000", category: "Cash" }));

    const events = await eventsOn(item.objectId);
    expect(events).toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "amount", oldValue: "1000", newValue: "2000" },
    ]);
    // category was resubmitted unchanged -- no event for it.
    expect(events.filter((event) => event.fieldKey === "category")).toHaveLength(0);
  });

  it("records nothing extra for balanceAsOf, which every save touches regardless of what changed", async () => {
    await saveFinanceItemAction("asset", null, {}, form({ name: "Savings", amount: "1000" }));
    const item = await prisma.financeItem.findFirstOrThrow({ where: { userId: owner, name: "Savings" } });

    await saveFinanceItemAction("asset", item.id, {}, form({ name: "Savings", amount: "1000" }));

    await expect(eventsOn(item.objectId)).resolves.toHaveLength(1); // just the original ITEM_CREATED
  });

  it("records FIELD_CHANGED for a recurring item's frequency and dates", async () => {
    await saveFinanceItemAction("income", null, {}, form({ name: "Salary", amount: "5000", frequency: "Monthly", startDate: "2026-01-01" }));
    const item = await prisma.financeItem.findFirstOrThrow({ where: { userId: owner, name: "Salary" } });

    await saveFinanceItemAction("income", item.id, {}, form({ name: "Salary", amount: "5000", frequency: "Fortnightly", startDate: "2026-01-01" }));

    const events = await eventsOn(item.objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "FIELD_CHANGED", fieldKey: "frequency", oldValue: "Monthly", newValue: "Fortnightly" });
  });

  it("reaches the same objectId through getFinanceItem, the getter the item's own detail page reads from", async () => {
    await saveFinanceItemAction("asset", null, {}, form({ name: "Savings", amount: "1000" }));
    const item = await prisma.financeItem.findFirstOrThrow({ where: { userId: owner, name: "Savings" } });
    await saveFinanceItemAction("asset", item.id, {}, form({ name: "Savings", amount: "1500" }));

    const detail = await getFinanceItem(item.id);

    await expect(eventsOn(detail!.objectId)).resolves.toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "amount", oldValue: "1000", newValue: "1500" },
    ]);
  });
});
