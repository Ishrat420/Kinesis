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
 * closed, undated, the parent goal no longer active).
 *
 * "Parent goal no longer active" used to also mean "past its own target
 * date" (a date comparison `activeGoalWhere` made against a precomputed
 * `today`, which is what this file originally existed to pin down --
 * `activeGoalWhere(now)` instead of `activeGoalWhere(today)` could drop a
 * goal targeted for today for part of the day). KD-028 removed that: a goal
 * is "not active" purely by its stored status column now, with no date
 * comparison anywhere, so that whole bug class -- and the "at what time of
 * day" question -- no longer applies. See the lapsed-goal tests below for
 * the current rule instead.
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

    const records = await getAttentionRecords();

    expect(kinds(records)).toEqual(["custom", "document", "milestone", "relationship", "todo"]);
    expect(records.map((record) => record.id).sort()).toEqual(["date-eligible", "doc-eligible", "item-eligible", "milestone-eligible", "todo-eligible"]);
  });

  /**
   * KD-028: a goal past its own target date, left Active, no longer
   * auto-archives -- its milestones keep reminding exactly as before it
   * lapsed. Only a manual status change (tested below) drops them.
   */
  it("keeps a milestone whose goal has lapsed past its target date, since the goal is still Active", async () => {
    const goal = await makeGoal("goal-lapsed", "Active", new Date("2026-06-01T00:00:00.000Z"));
    await prisma.milestone.create({ data: { id: "milestone-lapsed-goal", goalId: goal.id, name: "M", dueDate: new Date("2026-07-01") } });

    const records = await getAttentionRecords();

    expect(records.map((record) => record.id)).toContain("milestone-lapsed-goal");
  });

  it("excludes a milestone whose goal was manually set to a non-Active status", async () => {
    const goal = await makeGoal("goal-revisit", "Revisit Later", new Date("2026-12-01T00:00:00.000Z"));
    await prisma.milestone.create({ data: { id: "milestone-inactive-goal", goalId: goal.id, name: "M", dueDate: new Date("2026-07-01") } });

    const records = await getAttentionRecords();

    expect(records.map((record) => record.id)).not.toContain("milestone-inactive-goal");
  });
});
