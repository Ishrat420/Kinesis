import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { prisma } from "@/lib/data/prisma";
import { createTodoAction } from "@/app/(app)/todos/actions";
import { getTodos } from "@/lib/data/todos";

/**
 * The in-page "Add to-do" button's create, against the real database: status,
 * due date and Kinesis Link should land with the To-Do in one go, unlike quick
 * capture which only ever records a title.
 */

const owner = "create-todo-owner";
const stranger = "create-todo-stranger";

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
};

const authenticateAs = (userId: string) => mocks.requireKinesisUser.mockResolvedValue({ id: userId });

describe.sequential("create to-do", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.create({ data: { id: owner, firstName: "Create", lastName: "Owner", email: "create-todo@example.test" } });
    await prisma.user.create({ data: { id: stranger, firstName: "Someone", lastName: "Else", email: "create-todo-stranger@example.test" } });
    await prisma.object.create({ data: { id: "create-todo-passport-object", type: "DOCUMENT", name: "Passport Somalia", userId: owner } });
    await prisma.document.create({
      data: { id: "create-todo-passport", name: "Passport Somalia", type: "Passport", status: "Active", owner: "Owner", userId: owner, objectId: "create-todo-passport-object" },
    });
    authenticateAs(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("creates a To-Do with its status, due date and link in one submit", async () => {
    const result = await createTodoAction({}, form({
      name: "Renew car registration", status: "WAITING", dueDate: "2026-12-01", linkObjectId: "create-todo-passport-object",
    }));

    expect(result).toEqual({ created: true });
    const [todo] = await getTodos();
    expect(todo).toMatchObject({ name: "Renew car registration", status: "WAITING", dueDate: new Date("2026-12-01T00:00:00.000Z") });
    expect(todo.links).toEqual([expect.objectContaining({ name: "Passport Somalia" })]);
  });

  it("defaults to To do and no due date when only a title is given", async () => {
    const result = await createTodoAction({}, form({ name: "Something small" }));

    expect(result).toEqual({ created: true });
    const [todo] = await getTodos();
    expect(todo).toMatchObject({ status: "TODO", dueDate: null });
    expect(todo.links).toEqual([]);
  });

  it("refuses an empty title instead of creating a nameless To-Do", async () => {
    expect(await createTodoAction({}, form({ name: "   " }))).toEqual({ error: expect.any(String) });
    expect(await prisma.todo.count({ where: { userId: owner } })).toBe(0);
  });

  it("sets completedAt when created straight into Done", async () => {
    const result = await createTodoAction({}, form({ name: "Already handled", status: "DONE" }));

    expect(result).toEqual({ created: true });
    const [todo] = await prisma.todo.findMany({ where: { userId: owner } });
    expect(todo.completedAt).toBeInstanceOf(Date);
  });

  it("refuses the whole create, leaving no orphaned To-Do, when a link belongs to another account", async () => {
    await prisma.object.create({ data: { id: "create-todo-stranger-object", type: "GOAL", name: "Theirs", userId: stranger } });
    await prisma.goal.create({ data: { id: "create-todo-stranger-goal", name: "Theirs", userId: stranger, objectId: "create-todo-stranger-object" } });

    const result = await createTodoAction({}, form({ name: "Snoop", linkObjectId: "create-todo-stranger-object" }));

    expect(result).toEqual({ error: "One of the linked items no longer exists." });
    expect(await prisma.todo.count({ where: { userId: owner } })).toBe(0);
  });
});
