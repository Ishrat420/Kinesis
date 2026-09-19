import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { createTodo, updateTodoDetails } from "@/lib/data/todos";

/**
 * A To-Do's own "concerns" links go through `ObjectRelationship` just like a
 * typed Kinesis Link (KD-049's Problem §1), so KD-048's paired history
 * events apply here too -- with the added wrinkle that `updateTodoDetails`
 * replaces the whole link set on every save rather than reconciling it, so
 * the events it writes have to be a real diff, not "remove everything,
 * add everything back."
 */

const owner = "todo-link-history-owner";

async function makeGoal(id: string, name: string) {
  const objectId = `${id}-object`;
  await prisma.object.create({ data: { id: objectId, type: "GOAL", name, userId: owner } });
  await prisma.goal.create({ data: { id, name, userId: owner, objectId } });
  return objectId;
}

// Excludes ITEM_CREATED: every to-do created below also gets one of those
// (KD-048's own creation coverage, exercised elsewhere), which is real and
// correct but not what these tests are about -- a to-do's *link* history.
const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId, eventType: { not: "ITEM_CREATED" } }, orderBy: { occurredAt: "asc" } });

describe.sequential("a To-Do's own links record history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Todo", lastName: "Owner", email: "todo-link-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("createTodo writes a RELATIONSHIP_ADDED event on both the to-do and the linked object", async () => {
    const goalObjectId = await makeGoal("goal-1", "Buy a house");

    const todo = await createTodo("Book inspection", { linkObjectIds: [goalObjectId] });
    const { objectId: todoObjectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await expect(eventsOn(todoObjectId)).resolves.toMatchObject([{ eventType: "RELATIONSHIP_ADDED", relatedObjectId: goalObjectId, relatedObjectName: "Buy a house" }]);
    await expect(eventsOn(goalObjectId)).resolves.toMatchObject([{ eventType: "RELATIONSHIP_ADDED", relatedObjectId: todoObjectId, relatedObjectName: "Book inspection" }]);
  });

  it("updateTodoDetails only records what actually changed -- an untouched link gets no event", async () => {
    const goalObjectId = await makeGoal("goal-2", "Learn Spanish");
    const todo = await createTodo("Practice", { linkObjectIds: [goalObjectId] });
    const { objectId: todoObjectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    // Same set submitted again -- the rows underneath get replaced, but
    // nothing actually changed from the user's point of view.
    await updateTodoDetails(todo.id, { linkObjectIds: [goalObjectId] });

    await expect(eventsOn(todoObjectId)).resolves.toHaveLength(1);
    await expect(eventsOn(goalObjectId)).resolves.toHaveLength(1);
  });

  it("updateTodoDetails records an add for a newly linked object and a remove for a dropped one, in the same save", async () => {
    const keptObjectId = await makeGoal("goal-3", "Kept goal");
    const droppedObjectId = await makeGoal("goal-4", "Dropped goal");
    const addedObjectId = await makeGoal("goal-5", "Added goal");
    const todo = await createTodo("Multi-link todo", { linkObjectIds: [keptObjectId, droppedObjectId] });
    const { objectId: todoObjectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { linkObjectIds: [keptObjectId, addedObjectId] });

    const todoEvents = await eventsOn(todoObjectId);
    expect(todoEvents).toMatchObject([
      { eventType: "RELATIONSHIP_ADDED", relatedObjectId: keptObjectId },
      { eventType: "RELATIONSHIP_ADDED", relatedObjectId: droppedObjectId },
      { eventType: "RELATIONSHIP_REMOVED", relatedObjectId: droppedObjectId },
      { eventType: "RELATIONSHIP_ADDED", relatedObjectId: addedObjectId },
    ]);
    // The kept link's own original ADD (its create-time event, first in the
    // list above) is the only event about it -- no spurious remove-then-add
    // pair for a link that was never touched.
    expect(todoEvents.filter((event) => event.relatedObjectId === keptObjectId)).toHaveLength(1);
  });

  it("updateTodoDetails clearing every link records a remove for each one", async () => {
    const goalObjectId = await makeGoal("goal-6", "Solo goal");
    const todo = await createTodo("Clearing todo", { linkObjectIds: [goalObjectId] });
    const { objectId: todoObjectId } = await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } });

    await updateTodoDetails(todo.id, { linkObjectIds: [] });

    const todoEvents = await eventsOn(todoObjectId);
    expect(todoEvents.at(-1)).toMatchObject({ eventType: "RELATIONSHIP_REMOVED", relatedObjectId: goalObjectId });
  });
});
