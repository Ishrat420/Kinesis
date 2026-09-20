import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { prisma } from "@/lib/data/prisma";
import { setTodoStatusAction, deleteTodoAction } from "@/app/(app)/todos/actions";

/**
 * setTodoStatusAction and deleteTodoAction had no integration coverage at
 * all -- create and reschedule were covered, but the two mutations a person
 * hits constantly from the board (the row checkbox and its delete menu item)
 * were only ever exercised through a mocked Prisma client, if at all.
 */

const owner = "todo-status-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

async function makeTodo(overrides: Partial<{ status: "TODO" | "WAITING" | "DONE"; completedAt: Date | null }> = {}) {
  const object = await prisma.object.create({ data: { id: "status-todo-object", type: "TODO", userId: owner, name: "Water the plants" } });
  return prisma.todo.create({ data: { id: "status-todo", objectId: object.id, userId: owner, name: "Water the plants", status: "TODO", ...overrides } });
}

describe.sequential("setTodoStatusAction and deleteTodoAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Status", lastName: "Owner", email: "todo-status@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  describe("setTodoStatusAction", () => {
    it("rejects a status a to-do can't have, writing nothing", async () => {
      const todo = await makeTodo();
      const result = await setTodoStatusAction(todo.id, "ARCHIVED");
      expect(result).toEqual({ error: "That is not a status a to-do can have." });
      await expect(prisma.todo.findUniqueOrThrow({ where: { id: todo.id } })).resolves.toMatchObject({ status: "TODO" });
    });

    it("marks a to-do done and stamps completedAt", async () => {
      const todo = await makeTodo();
      const result = await setTodoStatusAction(todo.id, "DONE");
      expect(result).toEqual({});
      const updated = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });
      expect(updated.status).toBe("DONE");
      expect(updated.completedAt).not.toBeNull();
    });

    it("clears completedAt when a done to-do is reopened", async () => {
      const todo = await makeTodo({ status: "DONE", completedAt: new Date() });
      await setTodoStatusAction(todo.id, "TODO");
      const updated = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });
      expect(updated.status).toBe("TODO");
      expect(updated.completedAt).toBeNull();
    });

    it("refuses to change a to-do belonging to someone else", async () => {
      const stranger = "todo-status-stranger";
      await prisma.user.deleteMany({ where: { id: stranger } });
      await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "todo-status-stranger@example.test" } });
      const strangerObject = await prisma.object.create({ data: { id: "stranger-todo-object", type: "TODO", userId: stranger, name: "Not yours" } });
      const strangerTodo = await prisma.todo.create({ data: { id: "stranger-todo", objectId: strangerObject.id, userId: stranger, name: "Not yours", status: "TODO" } });

      const result = await setTodoStatusAction(strangerTodo.id, "DONE");
      expect(result).toEqual({ error: "This to-do no longer exists." });
      await expect(prisma.todo.findUniqueOrThrow({ where: { id: strangerTodo.id } })).resolves.toMatchObject({ status: "TODO" });
      await prisma.user.deleteMany({ where: { id: stranger } });
    });
  });

  describe("deleteTodoAction", () => {
    it("deletes an owned to-do", async () => {
      const todo = await makeTodo();
      const result = await deleteTodoAction(todo.id);
      expect(result).toEqual({});
      await expect(prisma.todo.findUnique({ where: { id: todo.id } })).resolves.toBeNull();
    });

    it("reports an already-deleted to-do rather than throwing", async () => {
      const result = await deleteTodoAction("does-not-exist");
      expect(result).toEqual({ error: "This to-do had already been deleted." });
    });

    it("does not delete a to-do belonging to someone else", async () => {
      const stranger = "todo-delete-stranger";
      await prisma.user.deleteMany({ where: { id: stranger } });
      await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "todo-delete-stranger@example.test" } });
      const strangerObject = await prisma.object.create({ data: { id: "stranger-delete-object", type: "TODO", userId: stranger, name: "Not yours" } });
      const strangerTodo = await prisma.todo.create({ data: { id: "stranger-delete-todo", objectId: strangerObject.id, userId: stranger, name: "Not yours", status: "TODO" } });

      const result = await deleteTodoAction(strangerTodo.id);
      expect(result).toEqual({ error: "This to-do had already been deleted." });
      await expect(prisma.todo.findUnique({ where: { id: strangerTodo.id } })).resolves.not.toBeNull();
      await prisma.user.deleteMany({ where: { id: stranger } });
    });
  });
});
