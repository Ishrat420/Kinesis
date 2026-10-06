import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/attention/dismissal", () => ({ parseDismissalKey: vi.fn() }));
vi.mock("@/lib/relationships/occurrence", () => ({ getNextOccurrence: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getTodo } from "@/lib/data/todos";
import { getKinesisLinkSection, getKinesisLinks } from "@/lib/data/object-relationships";
import { addKinesisLinkAction, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { saveTodoDetailsAction } from "@/app/(app)/todos/actions";

/**
 * A To-Do's links read from both ends: what the To-Do links to itself
 * (`links`, owned by its edit form) and what links to it from elsewhere
 * (`linkedFrom`) -- both shown as board chips and in its collapsed Kinesis
 * Links section.
 */

const owner = "todo-two-way-owner";

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
};

const direction = (value: string) => form({ direction: value });

describe.sequential("a To-Do's links in both directions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Two", lastName: "Way", email: "todo-two-way@example.test" } });
    await prisma.object.createMany({
      data: [
        { id: "tw-todo-object", type: "TODO", name: "Renew passport", userId: owner },
        { id: "tw-doc-object", type: "DOCUMENT", name: "Passport", userId: owner },
        { id: "tw-goal-object", type: "GOAL", name: "Travel to Japan", userId: owner },
      ],
    });
    await prisma.todo.create({ data: { id: "tw-todo", name: "Renew passport", userId: owner, objectId: "tw-todo-object" } });
    await prisma.document.create({ data: { id: "tw-doc", name: "Passport", type: "Passport", status: "Active", owner: "Owner", userId: owner, objectId: "tw-doc-object" } });
    await prisma.goal.create({ data: { id: "tw-goal", name: "Travel to Japan", userId: owner, objectId: "tw-goal-object" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("shows something that links to the To-Do, without handing it to the edit form", async () => {
    await addKinesisLinkAction("tw-goal-object", {}, form({ targetObjectId: "tw-todo-object", direction: "DEPENDS_ON|forward" }));

    const todo = await getTodo("tw-todo");
    expect(todo?.links).toEqual([]);
    expect(todo?.linkedFrom).toEqual([expect.objectContaining({ objectId: "tw-goal-object", href: "/goals/tw-goal" })]);
    await expect(getKinesisLinkSection("tw-todo-object")).resolves.toMatchObject({ links: [{ label: "Required for", target: { objectId: "tw-goal-object" } }] });
  });

  it("shows the To-Do's own link on the other record too", async () => {
    await saveTodoDetailsAction("tw-todo", {}, form({ target: "TODO", linkObjectId: ["tw-doc-object"] }));

    await expect(getKinesisLinks("tw-doc-object")).resolves.toMatchObject([{ target: { objectId: "tw-todo-object" } }]);
  });

  it("lists an object linked both ways once, as the To-Do's own link", async () => {
    await saveTodoDetailsAction("tw-todo", {}, form({ target: "TODO", linkObjectId: ["tw-doc-object"] }));
    await addKinesisLinkAction("tw-doc-object", {}, form({ targetObjectId: "tw-todo-object", direction: "BLOCKS|forward" }));

    const todo = await getTodo("tw-todo");
    expect(todo?.links.map((link) => link.objectId)).toEqual(["tw-doc-object"]);
    expect(todo?.linkedFrom).toEqual([]);
  });

  it("keeps a relationship type changed from the section through the next edit of the To-Do", async () => {
    await saveTodoDetailsAction("tw-todo", {}, form({ target: "TODO", linkObjectId: ["tw-doc-object"] }));
    const [link] = await getKinesisLinks("tw-todo-object");
    await updateKinesisLinkAction("tw-todo-object", link.id, direction("BLOCKS|forward"));

    await saveTodoDetailsAction("tw-todo", {}, form({ target: "TODO", notes: "Book an appointment", linkObjectId: ["tw-doc-object"] }));

    await expect(prisma.objectRelationship.findMany({ where: { userId: owner } })).resolves.toMatchObject([{ id: link.id, type: "BLOCKS" }]);
  });

  it("refreshes the To-Do's page and board when a link is removed from its section", async () => {
    await addKinesisLinkAction("tw-goal-object", {}, form({ targetObjectId: "tw-todo-object", direction: "RELATES_TO|forward" }));
    const [link] = await getKinesisLinks("tw-todo-object");

    await removeKinesisLinkAction("tw-todo-object", link.id);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/todos/tw-todo");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/todos");
    await expect(getTodo("tw-todo")).resolves.toMatchObject({ links: [], linkedFrom: [] });
  });
});
