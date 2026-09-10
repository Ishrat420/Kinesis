import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getUpcomingAndDue } from "@/lib/data/upcoming";

/**
 * getUpcomingAndDue reads five unrelated tables against a per-type reminder
 * window computed from settings, and a relationship date additionally rolls
 * forward through a yearly-repeat calculation. None of that -- the window
 * math, the joins, the settings fallback -- is exercised by a mocked Prisma
 * client.
 */

const owner = "upcoming-owner";
const stranger = "upcoming-stranger";
// A fixed "now", with the owner's settings pinned to UTC so date-window
// arithmetic doesn't depend on the machine running the suite.
const now = new Date("2026-06-15T00:00:00.000Z");

async function seedSettings(userId: string, overrides: Record<string, unknown> = {}) {
  await prisma.userSettings.upsert({
    where: { userId },
    update: { timeZone: "UTC", ...overrides },
    create: { userId, timeZone: "UTC", ...overrides },
  });
}

describe.sequential("Upcoming & Due", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Upcoming", lastName: "Owner", email: "upcoming-owner@example.test" },
        { id: stranger, firstName: "S", lastName: "T", email: "upcoming-stranger@example.test" },
      ],
    });
    await seedSettings(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("surfaces a document within its reminder window, a due milestone, a due to-do, a relationship date, and a due custom item -- sorted soonest first", async () => {
    // Expires in 10 days, with the default 30-day prompt -- inside its window.
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2026-06-25"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2026-06-20") } });

    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: new Date("2026-06-10"), userId: owner, objectId: "todo-obj" } });

    await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
    await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
    await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: new Date("2026-06-30"), repeatsYearly: true } });

    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2026-06-22"), moduleId: "module-1", objectId: "item-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items.map((item) => item.kind)).toEqual(["todo", "milestone", "custom", "document", "relationship"]);
  });

  it("excludes a document whose reminder window hasn't opened yet", async () => {
    // Expires in 200 days, with only a 30-day prompt -- well outside its window.
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2027-01-01"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("still surfaces an expired document even with reminders disabled", async () => {
    await seedSettings(owner, { remindersEnabled: false });
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2026-01-01"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items).toEqual([expect.objectContaining({ kind: "document", title: "Passport is expired" })]);
  });

  it("hides milestones, relationship dates, and custom items entirely once reminders are disabled", async () => {
    await seedSettings(owner, { remindersEnabled: false });
    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2026-06-20") } });

    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2026-06-22"), moduleId: "module-1", objectId: "item-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces an undated to-do, no matter how it's mapped", async () => {
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "No deadline", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "No deadline", userId: owner, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces a done to-do even if its due date has passed", async () => {
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Finished", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Finished", dueDate: new Date("2026-06-01"), status: "DONE", userId: owner, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("rolls a yearly-repeating date forward to next year once this year's has passed", async () => {
    await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
    await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
    // This year's occurrence (June 1) has already passed relative to `now`
    // (June 15), and next year's (2027-06-01) is outside the 30-day window.
    await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: new Date("2020-06-01"), repeatsYearly: true } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces another account's items", async () => {
    await seedSettings(stranger);
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Not yours", userId: stranger } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Not yours", dueDate: new Date("2026-06-10"), userId: stranger, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });
});
