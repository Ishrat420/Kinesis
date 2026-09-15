import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { prisma } from "@/lib/data/prisma";
import { updateTodoDueDateAction } from "@/app/(app)/todos/actions";

/**
 * KD-017: a to-do in Needs Attention now gets Reschedule, exactly like a
 * milestone -- this is the narrow due-date-only action that button calls,
 * mirroring updateMilestoneDueDateAction. Run against the real database
 * because ownership scoping and the stored instant are both things a mocked
 * Prisma client would only pretend to get right.
 */

const owner = "reschedule-owner";
const stranger = "reschedule-stranger";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function makeTodo(id: string, userId: string, dueDate: Date | null) {
  const objectId = `object-${id}`;
  await prisma.object.create({ data: { id: objectId, type: "TODO", name: id, userId } });
  return prisma.todo.create({ data: { id, name: id, userId, dueDate, objectId } });
}

describe.sequential("updateTodoDueDateAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Reschedule", lastName: "Owner", email: "reschedule-owner@example.test" },
        { id: stranger, firstName: "Reschedule", lastName: "Stranger", email: "reschedule-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("moves the due date to UTC midnight of the day submitted", async () => {
    await makeTodo("todo-1", owner, new Date("2020-01-01T00:00:00.000Z"));

    const state = await updateTodoDueDateAction("todo-1", {}, form({ dueDate: "2026-09-20" }));

    expect(state).toEqual({});
    const todo = await prisma.todo.findUniqueOrThrow({ where: { id: "todo-1" } });
    expect(todo.dueDate?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("rejects a missing due date instead of clearing it", async () => {
    await makeTodo("todo-1", owner, new Date("2020-01-01T00:00:00.000Z"));

    const state = await updateTodoDueDateAction("todo-1", {}, form({}));

    expect(state).toEqual({ error: "Enter a valid due date." });
    const todo = await prisma.todo.findUniqueOrThrow({ where: { id: "todo-1" } });
    expect(todo.dueDate?.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });

  it("rejects a calendar-impossible date", async () => {
    await makeTodo("todo-1", owner, null);

    const state = await updateTodoDueDateAction("todo-1", {}, form({ dueDate: "2026-02-30" }));

    expect(state).toEqual({ error: "Enter a valid due date." });
  });

  it("never moves another account's to-do", async () => {
    await makeTodo("todo-1", stranger, new Date("2020-01-01T00:00:00.000Z"));

    const state = await updateTodoDueDateAction("todo-1", {}, form({ dueDate: "2026-09-20" }));

    expect(state).toEqual({ error: "This to-do no longer exists." });
    const todo = await prisma.todo.findUniqueOrThrow({ where: { id: "todo-1" } });
    expect(todo.dueDate?.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });
});
