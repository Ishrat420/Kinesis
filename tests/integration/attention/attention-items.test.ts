import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getAttentionRecords } from "@/lib/data/attention-items";

/**
 * KD-017 Step One, Phase 1: `getAttentionRecords` is the one query each
 * record kind needs. This runs against the real database because the point
 * is exactly which rows survive the structural filters (archived, completed,
 * closed, undated, the parent goal no longer active) -- and, specifically,
 * that a goal targeted for today survives regardless of the time of day
 * `now` carries, which `getNeedsAttention`/`getUpcomingAndDue` currently get
 * wrong (KD-017 Phase 0, `activeGoalWhere(now)` instead of `activeGoalWhere
 * (today)`). `getToday` runs for real here, not mocked, so that bug fix is
 * actually exercised rather than assumed.
 */

const owner = "attention-items-owner";

const kinds = (records: Awaited<ReturnType<typeof getAttentionRecords>>) => records.map((record) => record.kind).sort();

async function makeGoal(id: string, status: string, targetDate: Date | null) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId: owner } });
  return prisma.goal.create({ data: { id, name: id, userId: owner, objectId: object.id, status, targetDate } });
}

describe.sequential("getAttentionRecords", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Attention", lastName: "Items", email: "attention-items@example.test" } });
    // Fixed at UTC so the activeGoalWhere-boundary test below can reason about
    // exact instants without a real-world timezone offset in the way.
    await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
  });

  it("returns one record per structurally-eligible item, excluding archived/completed/closed/undated ones", async () => {
    const goal = await makeGoal("goal-eligible", "Active", null);
    await prisma.milestone.create({ data: { id: "milestone-eligible", goalId: goal.id, name: "Eligible", dueDate: new Date("2026-06-20") } });
    await prisma.milestone.create({ data: { id: "milestone-completed", goalId: goal.id, name: "Completed", dueDate: new Date("2026-06-20"), completed: true } });
    await prisma.milestone.create({ data: { id: "milestone-undated", goalId: goal.id, name: "Undated" } });

    const documentObject = await prisma.object.create({ data: { id: "object-doc-eligible", type: "DOCUMENT", name: "Doc", userId: owner } });
    await prisma.document.create({ data: { id: "doc-eligible", objectId: documentObject.id, name: "Passport", type: "Identity", status: "Active", owner: "Owner", userId: owner, expiryDate: new Date("2026-06-20") } });
    const archivedDocObject = await prisma.object.create({ data: { id: "object-doc-archived", type: "DOCUMENT", name: "Doc", userId: owner } });
    await prisma.document.create({ data: { id: "doc-archived", objectId: archivedDocObject.id, name: "Old passport", type: "Identity", status: "Active", owner: "Owner", userId: owner, expiryDate: new Date("2026-06-20"), archived: true } });
    const undatedDocObject = await prisma.object.create({ data: { id: "object-doc-undated", type: "DOCUMENT", name: "Doc", userId: owner } });
    await prisma.document.create({ data: { id: "doc-undated", objectId: undatedDocObject.id, name: "No expiry", type: "Identity", status: "Active", owner: "Owner", userId: owner } });

    const customModule = await prisma.customModule.create({ data: { id: "module-eligible", userId: owner, name: "Books", normalizedName: "books", icon: "star", color: "#111111" } });
    const itemObject = await prisma.object.create({ data: { id: "object-item-eligible", type: "CUSTOM_ITEM", name: "Item", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-eligible", moduleId: customModule.id, objectId: itemObject.id, name: "Book", dueDate: new Date("2026-06-20") } });
    const archivedItemObject = await prisma.object.create({ data: { id: "object-item-archived", type: "CUSTOM_ITEM", name: "Item", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-archived", moduleId: customModule.id, objectId: archivedItemObject.id, name: "Old book", dueDate: new Date("2026-06-20"), archived: true } });

    const todoObject = await prisma.object.create({ data: { id: "object-todo-eligible", type: "TODO", name: "Todo", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-eligible", objectId: todoObject.id, userId: owner, name: "Renew", dueDate: new Date("2026-06-20") } });
    const doneTodoObject = await prisma.object.create({ data: { id: "object-todo-done", type: "TODO", name: "Todo", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-done", objectId: doneTodoObject.id, userId: owner, name: "Done already", dueDate: new Date("2026-06-20"), status: "DONE" } });

    const person = await prisma.object.create({ data: { id: "object-person", type: "PERSON", name: "Self", userId: owner } });
    await prisma.person.create({ data: { id: "person-self", objectId: person.id, userId: owner, name: "Self", isSelf: true } });
    await prisma.relationshipImportantDate.create({ data: { id: "date-eligible", selfPersonId: "person-self", label: "Birthday", date: new Date("2026-06-25") } });

    const records = await getAttentionRecords(new Date("2026-06-15T12:00:00.000Z"));

    expect(kinds(records)).toEqual(["custom", "document", "milestone", "relationship", "todo"]);
    expect(records.map((record) => record.id).sort()).toEqual(["date-eligible", "doc-eligible", "item-eligible", "milestone-eligible", "todo-eligible"]);
  });

  it("keeps a milestone whose goal targets today, regardless of the time of day `now` carries", async () => {
    // The bug this pins: activeGoalWhere(now) instead of activeGoalWhere(today)
    // would compare `targetDate: { gte: now } ` against a `now` that is late in
    // the day, so a goal targeted for midnight today would fail that
    // comparison until the clock caught back up to midnight -- a goal that
    // should read Active for the whole day dropping its milestones for part
    // of it.
    const goal = await makeGoal("goal-today", "Active", new Date("2026-06-15T00:00:00.000Z"));
    await prisma.milestone.create({ data: { id: "milestone-today-goal", goalId: goal.id, name: "M", dueDate: new Date("2026-07-01") } });

    const lateInTheDay = new Date("2026-06-15T23:30:00.000Z");
    const records = await getAttentionRecords(lateInTheDay);

    expect(records.map((record) => record.id)).toContain("milestone-today-goal");
  });

  it("excludes a milestone whose goal already lapsed past its target date", async () => {
    const goal = await makeGoal("goal-lapsed", "Active", new Date("2026-06-01T00:00:00.000Z"));
    await prisma.milestone.create({ data: { id: "milestone-lapsed-goal", goalId: goal.id, name: "M", dueDate: new Date("2026-07-01") } });

    const records = await getAttentionRecords(new Date("2026-06-15T12:00:00.000Z"));

    expect(records.map((record) => record.id)).not.toContain("milestone-lapsed-goal");
  });
});
