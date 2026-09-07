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
import { getCalendarItems } from "@/lib/data/calendar";

/**
 * A custom item's due date used to be written at noon UTC rather than
 * midnight, for no reason recorded anywhere -- every other due date in the app
 * has always used midnight. The calendar was the one reader that took the
 * stored instant at face value, so it read the leftover noon as a real time of
 * day: every custom item rendered as a 12:00 "Scheduled" event nobody had
 * entered, and unticking "Scheduled" in the calendar's own filter hid all of
 * them. These run the real action against a real database and read the result
 * back through the same calendar query the app renders from, because the bug
 * lived in the gap between what the form stored and what the calendar assumed.
 */

const owner = "due-date-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

async function makeModule() {
  return prisma.customModule.create({ data: { id: "module-1", userId: owner, name: "Car", normalizedName: "car", icon: "car", color: "#111111" } });
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe.sequential("a custom item's due date", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Due", lastName: "Owner", email: "due-date-owner@example.test" } });
    await makeModule();
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("is stored at midnight, not noon", async () => {
    const result = await createCustomItemAction("module-1", {}, form({ name: "Service the car", dueDate: "2027-03-15" }));

    expect(result.error).toBeUndefined();
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-1" }, select: { dueDate: true } });
    expect(item.dueDate).toEqual(new Date("2027-03-15T00:00:00.000Z"));
  });

  it("rejects a date that only looks valid, the way a To-Do's due date already does", async () => {
    // 30 February does not exist; the old regex-only check accepted it anyway
    // and silently rolled it into March.
    const result = await createCustomItemAction("module-1", {}, form({ name: "Service the car", dueDate: "2026-02-30" }));

    expect(result).toEqual({ error: "Enter a valid due date." });
    await expect(prisma.customItem.count({ where: { moduleId: "module-1" } })).resolves.toBe(0);
  });

  it("stays a plain due date on the calendar, not a scheduled 12:00 event", async () => {
    await createCustomItemAction("module-1", {}, form({ name: "Service the car", dueDate: "2027-03-15" }));

    const { id } = await prisma.customItem.findFirstOrThrow({ select: { id: true } });
    const items = await getCalendarItems(new Date("2027-03-01T00:00:00.000Z"), new Date("2027-03-31T23:59:59.999Z"));
    const due = items.find((item) => item.id === `custom-due-${id}`);

    expect(due).toMatchObject({ kind: "DATED" });
    expect(due?.startTime).toBeUndefined();
  });

  it("moves cleanly to a new day on edit, still at midnight", async () => {
    await createCustomItemAction("module-1", {}, form({ name: "Service the car", dueDate: "2027-03-15" }));
    const { id } = await prisma.customItem.findFirstOrThrow({ select: { id: true } });

    const result = await updateCustomItemAction("module-1", id, {}, form({ name: "Service the car", dueDate: "2027-04-01" }));

    expect(result.error).toBeUndefined();
    await expect(prisma.customItem.findUniqueOrThrow({ where: { id }, select: { dueDate: true } }))
      .resolves.toEqual({ dueDate: new Date("2027-04-01T00:00:00.000Z") });
  });

  it("stays optional: no due date is not an error", async () => {
    const result = await createCustomItemAction("module-1", {}, form({ name: "No due date" }));

    expect(result.error).toBeUndefined();
    await expect(prisma.customItem.findFirstOrThrow({ where: { name: "No due date" }, select: { dueDate: true } }))
      .resolves.toEqual({ dueDate: null });
  });
});
