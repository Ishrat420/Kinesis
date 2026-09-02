import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { prisma } from "@/lib/data/prisma";
import { captureTodoAction, saveTodoDetailsAction, undoCaptureAction } from "@/app/(app)/todos/actions";
import { getTodoLinkOptions, getTodos } from "@/lib/data/todos";
import { completeCaptureConversion } from "@/lib/data/capture";

/**
 * Quick capture end to end against the real database (KD-008, ADR-009).
 *
 * These run here rather than as unit tests because what is being checked is the
 * shape of the data a capture leaves behind: a To-Do is an Object-backed record,
 * so its identity, its link to another object, and its removal all go through
 * database machinery that a mock would only pretend to have.
 */

const owner = "quick-capture-owner";
const stranger = "quick-capture-stranger";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const authenticateAs = (userId: string) => mocks.requireKinesisUser.mockResolvedValue({ id: userId });

describe.sequential("quick capture", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.create({ data: { id: owner, firstName: "Capture", lastName: "Owner", email: "capture@example.test" } });
    await prisma.user.create({ data: { id: stranger, firstName: "Someone", lastName: "Else", email: "stranger@example.test" } });
    await prisma.object.create({ data: { id: "capture-passport-object", type: "DOCUMENT", name: "Passport Somalia", userId: owner } });
    await prisma.document.create({
      data: { id: "capture-passport", name: "Passport Somalia", type: "Passport", status: "Active", owner: "Owner", userId: owner, objectId: "capture-passport-object" },
    });
    authenticateAs(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("turns a title on its own into a To-Do, with no other decision required", async () => {
    const { captured, error } = await captureTodoAction("Update new passport details");

    expect(error).toBeUndefined();
    const todo = await prisma.todo.findUniqueOrThrow({ where: { id: captured!.id }, include: { object: true } });
    expect(todo).toMatchObject({ name: "Update new passport details", status: "TODO", dueDate: null, userId: owner });
    // The identity comes with the record, so the capture is linkable and
    // searchable from the moment it exists.
    expect(todo.object).toMatchObject({ type: "TODO", name: "Update new passport details", userId: owner });
  });

  it("refuses an empty capture instead of recording a nameless To-Do", async () => {
    expect(await captureTodoAction("   ")).toEqual({ error: expect.any(String) });
    expect(await prisma.todo.count({ where: { userId: owner } })).toBe(0);
  });

  it("trims the title, so a stray space does not become part of the record's name", async () => {
    const { captured } = await captureTodoAction("  Call the passport office  ");
    expect(captured!.name).toBe("Call the passport office");
  });

  it("removes the To-Do and its identity when the capture is undone", async () => {
    const { captured } = await captureTodoAction("Captured by mistake");
    await undoCaptureAction(captured!.id);

    expect(await prisma.todo.count({ where: { userId: owner } })).toBe(0);
    expect(await prisma.object.count({ where: { userId: owner, type: "TODO" } })).toBe(0);
  });

  it("records a status and due date, and links the To-Do to what it concerns", async () => {
    const { captured } = await captureTodoAction("Update new passport details");

    await saveTodoDetailsAction(captured!.id, {}, form({
      target: "TODO", status: "WAITING", dueDate: "2026-12-01", linkObjectId: "capture-passport-object",
    }));

    const [todo] = await getTodos();
    expect(todo).toMatchObject({ status: "WAITING", dueDate: new Date("2026-12-01T00:00:00.000Z") });
    // The link is an ObjectRelationship, not a column, so a To-Do can concern
    // any kind of record without the table learning about that kind.
    expect(todo.links).toEqual([expect.objectContaining({ name: "Passport Somalia", module: "Documents", href: "/documents/capture-passport" })]);
  });

  it("clears the completion date when a done To-Do is reopened", async () => {
    const { captured } = await captureTodoAction("Book the appointment");

    await saveTodoDetailsAction(captured!.id, {}, form({ target: "TODO", status: "DONE" }));
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: captured!.id } })).completedAt).toBeInstanceOf(Date);

    await saveTodoDetailsAction(captured!.id, {}, form({ target: "TODO", status: "TODO" }));
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: captured!.id } })).completedAt).toBeNull();
  });

  it("refuses to link a To-Do to an object another account owns", async () => {
    const { captured } = await captureTodoAction("Snoop");
    await prisma.object.create({ data: { id: "stranger-object", type: "GOAL", name: "Theirs", userId: stranger } });
    await prisma.goal.create({ data: { id: "stranger-goal", name: "Theirs", userId: stranger, objectId: "stranger-object" } });

    await expect(saveTodoDetailsAction(captured!.id, {}, form({ target: "TODO", linkObjectId: "stranger-object" })))
      .rejects.toThrow(/Linked object not found/);
    expect(await prisma.objectRelationship.count({ where: { userId: owner } })).toBe(0);
  });

  it("sends a capture to the module that owns the target rather than saving it here", async () => {
    const { captured } = await captureTodoAction("Passport Somalia");

    await saveTodoDetailsAction(captured!.id, {}, form({ target: "DOCUMENT", name: "Passport Somalia", dueDate: "2026-12-01" }));

    expect(mocks.redirect).toHaveBeenCalledWith(`/documents?capture=Passport+Somalia&from=${captured!.id}`);
    // Still a To-Do: nothing is retired until the richer record actually exists.
    expect(await prisma.todo.count({ where: { id: captured!.id } })).toBe(1);
  });

  it("passes a due date on to a goal, which has a target date to hold it", async () => {
    const { captured } = await captureTodoAction("Save a deposit");

    await saveTodoDetailsAction(captured!.id, {}, form({ target: "GOAL", name: "Save a deposit", dueDate: "2026-12-01" }));

    expect(mocks.redirect).toHaveBeenCalledWith(`/goals?capture=Save+a+deposit&from=${captured!.id}&due=2026-12-01`);
  });

  it("retires the To-Do and records the conversion once the richer record exists", async () => {
    const { captured } = await captureTodoAction("Update new passport details");

    await completeCaptureConversion(form({ from: captured!.id }), {
      moduleName: "Documents", objectName: "Passport Somalia", icon: "documents", href: "/documents/capture-passport",
    });

    expect(await prisma.todo.count({ where: { id: captured!.id } })).toBe(0);
    expect(await prisma.activityEvent.findFirst({ where: { userId: owner, action: "Converted" } })).toMatchObject({
      objectName: "Update new passport details → Passport Somalia",
      href: "/documents/capture-passport",
    });
  });

  it("leaves another account's To-Do alone when a conversion names it", async () => {
    authenticateAs(stranger);
    const { captured } = await captureTodoAction("Not yours");
    authenticateAs(owner);

    await completeCaptureConversion(form({ from: captured!.id }), {
      moduleName: "Documents", objectName: "Passport Somalia", icon: "documents", href: "/documents/capture-passport",
    });

    expect(await prisma.todo.count({ where: { id: captured!.id } })).toBe(1);
  });

  it("offers everything but other To-Dos as something a capture can concern", async () => {
    await captureTodoAction("Also a to-do");

    const options = await getTodoLinkOptions();

    expect(options.map(({ name }) => name)).toEqual(["Passport Somalia"]);
  });

  it("keeps another account's records out of the link picker", async () => {
    await prisma.object.create({ data: { id: "stranger-doc-object", type: "DOCUMENT", name: "Their passport", userId: stranger } });
    await prisma.document.create({
      data: { id: "stranger-doc", name: "Their passport", type: "Passport", status: "Active", owner: "Them", userId: stranger, objectId: "stranger-doc-object" },
    });

    expect((await getTodoLinkOptions()).map(({ name }) => name)).toEqual(["Passport Somalia"]);
  });
});
