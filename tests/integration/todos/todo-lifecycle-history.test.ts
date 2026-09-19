import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { captureTodo, createTodo, updateTodoDetails } from "@/lib/data/todos";

/**
 * KD-048 Phase 1 remainder: a To-Do's own lifecycle -- creation, completing,
 * reopening, and its plain fields (due date, notes) -- rather than the links
 * it concerns (see todo-link-history.test.ts).
 */

const owner = "todo-lifecycle-owner";

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a To-Do's own lifecycle records history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Todo", lastName: "Owner", email: "todo-lifecycle@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("captureTodo records ITEM_CREATED", async () => {
    const todo = await captureTodo("Renew passport");
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("createTodo records ITEM_CREATED", async () => {
    const todo = await createTodo("Book inspection");
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("records TODO_COMPLETED when status moves to DONE", async () => {
    const todo = await createTodo("Pack bags");
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { status: "DONE" });

    const events = await eventsOn(objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "TODO_COMPLETED" });
  });

  it("records TODO_REOPENED when status moves away from DONE", async () => {
    const todo = await createTodo("Pack bags", { status: "DONE" });
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { status: "TODO" });

    const events = await eventsOn(objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "TODO_REOPENED" });
  });

  it("records a generic STATUS_CHANGED for a transition that isn't a completion or reopening", async () => {
    const todo = await createTodo("Waiting on quote");
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { status: "WAITING" });

    const events = await eventsOn(objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "STATUS_CHANGED", oldValue: "TODO", newValue: "WAITING" });
  });

  it("records nothing when the status is submitted unchanged", async () => {
    const todo = await createTodo("Steady state", { status: "TODO" });
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { status: "TODO" });

    await expect(eventsOn(objectId)).resolves.toHaveLength(1); // just the original ITEM_CREATED
  });

  it("records FIELD_CHANGED for a due date change", async () => {
    const todo = await createTodo("Renew license");
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { dueDate: new Date("2030-01-01T00:00:00.000Z") });

    const events = await eventsOn(objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "FIELD_CHANGED", fieldKey: "dueDate", fieldLabel: "Due date", oldValue: null, newValue: "2030-01-01" });
  });

  it("records FIELD_CHANGED for a notes change, and nothing when notes are resubmitted unchanged", async () => {
    const todo = await createTodo("Call the bank", { notes: "Ask about the fee" });
    const { objectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { notes: "Ask about the fee" });
    await expect(eventsOn(objectId)).resolves.toHaveLength(1); // unchanged -- no event

    await updateTodoDetails(todo.id, { notes: "Ask about the annual fee" });
    const events = await eventsOn(objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "FIELD_CHANGED", fieldKey: "notes", oldValue: "Ask about the fee", newValue: "Ask about the annual fee" });
  });
});
