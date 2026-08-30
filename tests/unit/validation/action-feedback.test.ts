import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  addActivity: vi.fn(),
  goalFindFirst: vi.fn(),
  goalUpdateMany: vi.fn(),
  goalCreate: vi.fn(),
  goalUnitUpsert: vi.fn(),
  milestoneCreate: vi.fn(),
  milestoneUpdateMany: vi.fn(),
  transaction: vi.fn(),
  financeFindFirst: vi.fn(),
  financeCreate: vi.fn(),
  financeUpdate: vi.fn(),
  moduleFindFirst: vi.fn(),
  itemCreate: vi.fn(),
  validateKinesisTargets: vi.fn(),
  getFormatPreferences: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/activity", () => ({ addActivity: mocks.addActivity }));
vi.mock("@/lib/data/kinesis-links", () => ({ validateKinesisTargets: mocks.validateKinesisTargets }));
vi.mock("@/lib/format/server", () => ({ getFormatPreferences: mocks.getFormatPreferences }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    goal: { findFirst: mocks.goalFindFirst, updateMany: mocks.goalUpdateMany, create: mocks.goalCreate },
    goalUnit: { upsert: mocks.goalUnitUpsert },
    milestone: { create: mocks.milestoneCreate, updateMany: mocks.milestoneUpdateMany },
    financeItem: { findFirst: mocks.financeFindFirst, create: mocks.financeCreate, update: mocks.financeUpdate },
    customModule: { findFirst: mocks.moduleFindFirst },
    customItem: { create: mocks.itemCreate },
    $transaction: mocks.transaction,
  },
}));

import { addMilestoneAction, addTargetAction, createGoalAction, updateGoalStatusAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { saveFinanceItem } from "@/app/(app)/finance/actions";
import { createCustomItemAction } from "@/app/(app)/custom-modules/actions";
import type { FinanceItem } from "@/lib/finance";
import { formatDate } from "@/lib/dates";
import { DEFAULT_FORMAT_PREFERENCES } from "@/lib/format/preferences";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const GOAL = "goal-id";
const TARGET_DATE = new Date("2030-06-01T23:59:59.999Z");
// Derived through the same formatter the action uses, so the assertion holds
// on any ICU build and follows the owner's locale.
const dueDateConflict = `The due date must be before the goal target date of ${formatDate(TARGET_DATE, DEFAULT_FORMAT_PREFERENCES.locale)}.`;
const MODULE = "module-id";
const financeItem = (overrides: Partial<FinanceItem> = {}): FinanceItem =>
  ({ id: "finance-id", kind: "asset", name: "Savings", amount: 100, ...overrides });

const noWrites = () => {
  expect(mocks.goalCreate).not.toHaveBeenCalled();
  expect(mocks.goalUpdateMany).not.toHaveBeenCalled();
  expect(mocks.milestoneCreate).not.toHaveBeenCalled();
  expect(mocks.milestoneUpdateMany).not.toHaveBeenCalled();
  expect(mocks.financeCreate).not.toHaveBeenCalled();
  expect(mocks.financeUpdate).not.toHaveBeenCalled();
  expect(mocks.itemCreate).not.toHaveBeenCalled();
};

describe("invalid submissions report an error instead of silently doing nothing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.goalFindFirst.mockResolvedValue({ currentValue: null, targetDate: null, _count: { milestones: 0 } });
    mocks.moduleFindFirst.mockResolvedValue({ id: MODULE });
    mocks.financeFindFirst.mockResolvedValue(null);
    mocks.getFormatPreferences.mockResolvedValue(DEFAULT_FORMAT_PREFERENCES);
  });

  describe("goals", () => {
    it("rejects an empty goal name", async () => {
      await expect(createGoalAction({}, form({ name: "   " }))).resolves.toEqual({ error: "Enter a goal name." });
      expect(mocks.redirect).not.toHaveBeenCalled();
      noWrites();
    });

    it("rejects a malformed target date", async () => {
      await expect(createGoalAction({}, form({ name: "Buy a home", targetDate: "31-12-2030" }))).resolves.toEqual({ error: "Enter a valid target date." });
      noWrites();
    });

    it("rejects a status outside the allowed set", async () => {
      const state = await updateGoalStatusAction(GOAL, {}, form({ status: "Procrastinating" }));
      expect(state.error).toMatch(/^Choose one of /);
      noWrites();
    });

    it("accepts a status inside the allowed set", async () => {
      await expect(updateGoalStatusAction(GOAL, {}, form({ status: "Finished" }))).resolves.toEqual({});
      expect(mocks.goalUpdateMany).toHaveBeenCalledOnce();
    });

    it.each([
      ["a milestone due on the goal target date", "2030-06-01"],
      ["a milestone due after the goal target date", "2030-09-01"],
    ])("rejects %s", async (_name, dueDate) => {
      mocks.goalFindFirst.mockResolvedValue({ currentValue: null, targetDate: TARGET_DATE, _count: { milestones: 0 } });
      const state = await addMilestoneAction(GOAL, {}, form({ name: "Deposit saved", dueDate }));
      expect(state.error).toBe(dueDateConflict);
      noWrites();
    });

    it("accepts a milestone due before the goal target date", async () => {
      mocks.goalFindFirst.mockResolvedValue({ currentValue: null, targetDate: TARGET_DATE, _count: { milestones: 0 } });
      await expect(addMilestoneAction(GOAL, {}, form({ name: "Deposit saved", dueDate: "2030-05-31" }))).resolves.toEqual({});
      expect(mocks.milestoneCreate).toHaveBeenCalledOnce();
    });

    it("rejects a malformed milestone due date", async () => {
      await expect(addMilestoneAction(GOAL, {}, form({ name: "Deposit saved", dueDate: "soon" }))).resolves.toEqual({ error: "Enter a valid due date." });
      noWrites();
    });

    it("rejects a due-date-only edit that lands on the goal target date", async () => {
      mocks.goalFindFirst.mockResolvedValue({ targetDate: TARGET_DATE });
      const state = await updateMilestoneDueDateAction(GOAL, "milestone-id", {}, form({ dueDate: "2030-06-01" }));
      expect(state.error).toBe(dueDateConflict);
      noWrites();
    });

    it.each([
      ["a non-numeric target value", { targetValue: "lots", currentValue: "5", unit: "Books" }, "Enter a target value as a number."],
      ["a non-numeric current value", { targetValue: "50", currentValue: "some", unit: "Books" }, "Enter a current value as a number."],
      ["a negative value", { targetValue: "-50", currentValue: "5", unit: "Books" }, "Target and current values cannot be negative."],
      ["a missing unit", { targetValue: "50", currentValue: "5", unit: "  " }, "Enter a unit, such as $AUD or Books."],
    ])("rejects %s on a measurable target", async (_name, values, error) => {
      await expect(addTargetAction(GOAL, {}, form(values))).resolves.toEqual({ error });
      expect(mocks.transaction).not.toHaveBeenCalled();
      noWrites();
    });
  });

  describe("finance", () => {
    it.each([
      ["an empty name", financeItem({ name: "  " }), "Enter a name."],
      ["an unknown kind", financeItem({ kind: "crypto" as FinanceItem["kind"] }), "Choose a valid item type."],
      ["a non-numeric amount", financeItem({ amount: Number.NaN }), "Enter the amount as a number."],
      ["a negative amount", financeItem({ amount: -1 }), "The amount cannot be negative."],
      ["a negative rate", financeItem({ rate: -2 }), "Enter the rate as a positive number."],
      ["a missing frequency on a recurring item", financeItem({ kind: "income" }), "Choose how often this repeats."],
      ["an unknown frequency", financeItem({ kind: "expense", frequency: "Daily" as FinanceItem["frequency"] }), "Choose how often this repeats."],
      ["a malformed start date", financeItem({ kind: "income", frequency: "Monthly", startDate: "01/01/2030" }), "Enter a valid start date."],
      ["an end date before the start date", financeItem({ kind: "income", frequency: "Monthly", startDate: "2030-02-01", endDate: "2030-01-01" }), "The end date must be on or after the start date."],
    ])("rejects %s", async (_name, item, error) => {
      await expect(saveFinanceItem(item, false)).resolves.toEqual({ error });
      noWrites();
      expect(mocks.addActivity).not.toHaveBeenCalled();
    });

    it("saves a valid item", async () => {
      await expect(saveFinanceItem(financeItem(), false)).resolves.toEqual({});
      expect(mocks.financeCreate).toHaveBeenCalledOnce();
    });
  });

  describe("custom modules", () => {
    it("rejects an empty item name", async () => {
      await expect(createCustomItemAction(MODULE, {}, form({ name: "   " }))).resolves.toEqual({ error: "Enter an item name." });
      noWrites();
    });

    it("rejects an over-long item name", async () => {
      await expect(createCustomItemAction(MODULE, {}, form({ name: "n".repeat(101) }))).resolves.toEqual({ error: "Keep the item name under 100 characters." });
      noWrites();
    });

    it("rejects a malformed reminder date", async () => {
      await expect(createCustomItemAction(MODULE, {}, form({ name: "Passport", reminder: "next week" }))).resolves.toEqual({ error: "Enter a valid reminder date." });
      noWrites();
    });
  });
});
