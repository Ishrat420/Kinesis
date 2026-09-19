import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { captureTodo, createTodo, getTodo } from "@/lib/data/todos";

/** KD-048: getTodo(id), the single-item getter the To-Do's own detail page/window reads from. */

const owner = "todo-detail-owner";

describe.sequential("getTodo (KD-048's own detail page)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Todo", lastName: "Owner", email: "todo-detail@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("returns one to-do with its Object identity and its links resolved", async () => {
    const target = await captureTodo("Buy a house");
    const { objectId: targetObjectId } = await prisma.todo.findUniqueOrThrow({ where: { id: target.id } });
    const todo = await createTodo("Renew passport", { notes: "Check expiry first", linkObjectIds: [targetObjectId] });
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    const detail = await getTodo(todo.id);

    expect(detail).toMatchObject({ id: todo.id, name: "Renew passport", notes: "Check expiry first", objectId });
    expect(detail?.links).toMatchObject([{ objectId: targetObjectId, name: "Buy a house" }]);
  });

  it("returns null for an id that doesn't exist", async () => {
    await expect(getTodo("not-a-real-id")).resolves.toBeNull();
  });

  it("never returns another account's to-do", async () => {
    const stranger = "todo-stranger-detail";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "todo-stranger-detail@example.test" } });
    mocks.requireKinesisUser.mockResolvedValue({ id: stranger });
    const strangerTodo = await captureTodo("Not yours");
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });

    await expect(getTodo(strangerTodo.id)).resolves.toBeNull();

    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});
