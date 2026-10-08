import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { completeRecurringOccurrenceAction, createCustomItemAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { getCalendarItems } from "@/lib/data/calendar";
import { getCustomItem } from "@/lib/data/custom-modules";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";
import { getToday } from "@/lib/format/server";

/**
 * KD-055's object side, end to end against a real database: the Recurring
 * Due Date field's two inputs saved through the real create/update actions,
 * completing an occurrence, and the calendar's projection -- plus the
 * migration's check constraints as the backstop under all of it.
 */

const owner = "recurring-due-owner";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function makeModule() {
  await prisma.template.create({
    data: {
      id: "rec-template", userId: owner, name: "Car Service",
      fields: { create: [{ id: "field-next", label: "Next service due", type: "DATE", position: 0, isRecurringDueDate: true }] },
    },
  });
  await prisma.customModule.create({ data: { id: "rec-module", userId: owner, name: "Car", normalizedName: "car", icon: "car", color: "#111111", templateId: "rec-template" } });
}

const form = (name: string, value: string, recurrenceRule: string, recurrenceDays = "", extra: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("name", name);
  for (const [key, entry] of Object.entries(extra)) data.set(key, entry);
  data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify([{ templateFieldId: "field-next", value, targetObjectIds: [], recurrenceRule, recurrenceDays }]));
  return data;
};

/** An item placed directly, for the tests that need a specific stored state. */
async function placeItem(data: { dueDate: Date; recurrence: "WEEKLY" | "MONTHLY" | "EVERY_N_DAYS"; recurrenceDays?: number; recurrenceAnchorDay?: number; archived?: boolean }) {
  const objectId = crypto.randomUUID();
  await prisma.object.create({ data: { id: objectId, userId: owner, type: "CUSTOM_ITEM", name: "Service the car", templateId: "rec-template" } });
  return prisma.customItem.create({ data: { id: crypto.randomUUID(), moduleId: "rec-module", objectId, name: "Service the car", recurrenceDays: null, recurrenceAnchorDay: null, ...data } });
}

const events = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a custom item's Recurring Due Date", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Recurring", lastName: "Owner", email: "recurring-due-owner@example.test" } });
    await makeModule();
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  describe("saving the field", () => {
    it("stores the date as the item's dueDate, with the rule and its anchor day", async () => {
      const result = await createCustomItemAction("rec-module", {}, form("Service the car", "2027-01-31", "MONTHLY"));

      expect(result.error).toBeUndefined();
      const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "rec-module" } });
      expect(item).toMatchObject({ dueDate: d("2027-01-31"), recurrence: "MONTHLY", recurrenceDays: null, recurrenceAnchorDay: 31 });
      // Never also written as an ObjectField row.
      await expect(prisma.objectField.count({ where: { objectId: item.objectId } })).resolves.toBe(0);
    });

    it("stores N for every N days", async () => {
      await createCustomItemAction("rec-module", {}, form("Service the car", "2027-01-31", "EVERY_N_DAYS", "90"));
      await expect(prisma.customItem.findFirstOrThrow({ where: { moduleId: "rec-module" } })).resolves.toMatchObject({ recurrence: "EVERY_N_DAYS", recurrenceDays: 90, recurrenceAnchorDay: null });
    });

    it("refuses a date without a rule, and creates nothing", async () => {
      const result = await createCustomItemAction("rec-module", {}, form("Service the car", "2027-01-31", ""));
      expect(result).toEqual({ error: "Pick how often it repeats." });
      await expect(prisma.customItem.count({ where: { moduleId: "rec-module" } })).resolves.toBe(0);
    });

    it("reads back through getCustomItem with its rule", async () => {
      await createCustomItemAction("rec-module", {}, form("Service the car", "2027-01-31", "FORTNIGHTLY"));
      const created = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "rec-module" } });
      const item = await getCustomItem("rec-module", created.id);
      expect(item?.templateFields[0]).toMatchObject({ isRecurringDueDate: true, value: "2027-01-31", recurrence: { rule: "FORTNIGHTLY", days: null, anchorDay: null } });
    });

    it("keeps the anchor day when an unrelated save resubmits a clamped date unchanged", async () => {
      const item = await placeItem({ dueDate: d("2027-02-28"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      const result = await updateCustomItemAction("rec-module", item.id, {}, form("Service the Golf", "2027-02-28", "MONTHLY", "", { updatedAt: item.updatedAt.toISOString() }));

      expect(result.error).toBeUndefined();
      await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ dueDate: d("2027-02-28"), recurrenceAnchorDay: 31 });
      expect((await events(item.objectId)).map((event) => event.fieldKey)).toEqual(["name"]);
    });

    it("re-anchors and logs a Repeats change when the rule changes", async () => {
      const item = await placeItem({ dueDate: d("2027-02-28"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      await updateCustomItemAction("rec-module", item.id, {}, form("Service the car", "2027-02-28", "YEARLY", "", { updatedAt: item.updatedAt.toISOString() }));

      await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ recurrence: "YEARLY", recurrenceAnchorDay: 28 });
      expect((await events(item.objectId)).map(({ eventType, fieldKey, oldValue, newValue }) => ({ eventType, fieldKey, oldValue, newValue })))
        .toEqual([{ eventType: "FIELD_CHANGED", fieldKey: "recurrence", oldValue: "Every month", newValue: "Every year" }]);
    });

    it("clears the date and the rule together", async () => {
      const item = await placeItem({ dueDate: d("2027-02-28"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      await updateCustomItemAction("rec-module", item.id, {}, form("Service the car", "", "", "", { updatedAt: item.updatedAt.toISOString() }));
      await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ dueDate: null, recurrence: null, recurrenceAnchorDay: null });
    });
  });

  describe("completing an occurrence", () => {
    it("advances one step from the due date and records the occurrence in History", async () => {
      const item = await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });

      await expect(completeRecurringOccurrenceAction("rec-module", item.id, "2099-01-31")).resolves.toEqual({ nextDueDate: "2099-02-28" });
      await expect(completeRecurringOccurrenceAction("rec-module", item.id, "2099-02-28")).resolves.toEqual({ nextDueDate: "2099-03-31" });

      expect((await events(item.objectId)).map(({ eventType, oldValue, newValue }) => ({ eventType, oldValue, newValue }))).toEqual([
        { eventType: "RECURRENCE_COMPLETED", oldValue: "2099-01-31", newValue: "2099-02-28" },
        { eventType: "RECURRENCE_COMPLETED", oldValue: "2099-02-28", newValue: "2099-03-31" },
      ]);
    });

    it("refuses a stale completion instead of skipping an occurrence", async () => {
      const item = await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      await completeRecurringOccurrenceAction("rec-module", item.id, "2099-01-31");

      const second = await completeRecurringOccurrenceAction("rec-module", item.id, "2099-01-31");
      expect(second).toMatchObject({ conflict: true });
      await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ dueDate: d("2099-02-28") });
      await expect(prisma.objectEvent.count({ where: { objectId: item.objectId } })).resolves.toBe(1);
    });

    it("catches a long-overdue item up to today or later", async () => {
      const item = await placeItem({ dueDate: d("2000-01-03"), recurrence: "WEEKLY" });
      const today = await getToday();

      const result = await completeRecurringOccurrenceAction("rec-module", item.id, "2000-01-03");

      const next = d(result.nextDueDate!);
      expect(next.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(next.getTime() - today.getTime()).toBeLessThan(7 * 86_400_000);
      expect(next.getUTCDay()).toBe(d("2000-01-03").getUTCDay());
    });

    it("refuses while the item is archived", async () => {
      const item = await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31, archived: true });
      await expect(completeRecurringOccurrenceAction("rec-module", item.id, "2099-01-31")).resolves.toMatchObject({ error: "Restore this item before completing it." });
      await expect(prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toMatchObject({ dueDate: d("2099-01-31") });
    });
  });

  describe("the calendar", () => {
    it("projects later occurrences into a future month, marked recurring, with no reminder pin", async () => {
      await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });

      const items = await getCalendarItems(d("2099-02-23"), new Date("2099-04-05T23:59:59.999Z"));
      const mine = items.filter((entry) => entry.sourceType === "CUSTOM_OBJECT" || entry.sourceType === "REMINDER");
      expect(mine.map(({ date, recurring, sourceType }) => ({ date, recurring, sourceType }))).toEqual([
        { date: "2099-02-28", recurring: true, sourceType: "CUSTOM_OBJECT" },
        { date: "2099-03-31", recurring: true, sourceType: "CUSTOM_OBJECT" },
      ]);
    });

    it("never draws an occurrence before the current due date", async () => {
      await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      const items = await getCalendarItems(d("2098-11-01"), new Date("2098-12-31T23:59:59.999Z"));
      expect(items.filter((entry) => entry.sourceType === "CUSTOM_OBJECT")).toEqual([]);
    });

    it("keeps the current occurrence's own id and reminder pin", async () => {
      const item = await placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31 });
      const items = await getCalendarItems(d("2098-12-29"), new Date("2099-02-08T23:59:59.999Z"));
      expect(items.find((entry) => entry.id === `custom-due-${item.id}`)).toMatchObject({ date: "2099-01-31", recurring: true });
      expect(items.some((entry) => entry.id === `custom-reminder-${item.id}`)).toBe(true);
    });
  });

  describe("database backstop", () => {
    it("refuses a rule without a due date, N on the wrong rule, or a monthly rule without an anchor", async () => {
      await expect(placeItem({ dueDate: null as unknown as Date, recurrence: "WEEKLY" })).rejects.toThrow();
      await expect(placeItem({ dueDate: d("2099-01-31"), recurrence: "WEEKLY", recurrenceDays: 5 })).rejects.toThrow();
      await expect(placeItem({ dueDate: d("2099-01-31"), recurrence: "EVERY_N_DAYS" })).rejects.toThrow();
      await expect(placeItem({ dueDate: d("2099-01-31"), recurrence: "MONTHLY" })).rejects.toThrow();
    });
  });
});
