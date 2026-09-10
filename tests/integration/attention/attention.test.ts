import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getNeedsAttention } from "@/lib/data/attention";
import { dismissAttentionItem } from "@/app/actions";
import { dismissalKey } from "@/lib/attention/dismissal";

/**
 * getNeedsAttention joins four unrelated tables (documents, milestones,
 * custom items, to-dos) against a live-scoped dismissal set, and
 * dismissAttentionItem writes two rows in one transaction keyed off a date
 * baked into the dismissal key. A mocked Prisma client can't catch a key that
 * silently stops matching, or a transaction that only half-applies.
 */

const owner = "attention-owner";
const stranger = "attention-stranger";
const past = new Date("2020-01-01T00:00:00.000Z");
const future = new Date("2999-01-01T00:00:00.000Z");

describe.sequential("Needs Attention", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Attention", lastName: "Owner", email: "attention-owner@example.test" },
        { id: stranger, firstName: "S", lastName: "T", email: "attention-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("getNeedsAttention", () => {
    it("surfaces an overdue document, milestone, custom item, and to-do, sorted oldest first", async () => {
      await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2020-06-01"), userId: owner, objectId: "doc-obj" } });

      await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
      await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
      await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2020-03-01") } });

      await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
      await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
      await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2020-09-01"), moduleId: "module-1", objectId: "item-obj" } });

      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: new Date("2020-01-15"), userId: owner, objectId: "todo-obj" } });

      const items = await getNeedsAttention(future);

      expect(items.map((item) => item.kind)).toEqual(["todo", "milestone", "document", "custom"]);
      expect(items.map((item) => item.title)).toEqual(["Renew passport", "Finish chapter 1", "Passport", "Dune"]);
    });

    it("never surfaces an item whose deadline hasn't arrived yet", async () => {
      await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: future, userId: owner, objectId: "doc-obj" } });

      await expect(getNeedsAttention(past)).resolves.toEqual([]);
    });

    it("excludes a completed to-do and a completed milestone even when overdue", async () => {
      await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
      await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
      await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Done already", dueDate: past, completed: true } });

      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Done to-do", userId: owner } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Done to-do", dueDate: past, status: "DONE", userId: owner, objectId: "todo-obj" } });

      await expect(getNeedsAttention(future)).resolves.toEqual([]);
    });

    it("hides an item once it has been dismissed at its current deadline", async () => {
      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: past, userId: owner, objectId: "todo-obj" } });
      const key = dismissalKey("todo", "todo-1", past);
      await prisma.attentionDismissal.create({ data: { id: "dismissal-1", userId: owner, itemKey: key, todoId: "todo-1" } });

      await expect(getNeedsAttention(future)).resolves.toEqual([]);
    });

    it("never surfaces another account's overdue items", async () => {
      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Not yours", userId: stranger } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Not yours", dueDate: past, userId: stranger, objectId: "todo-obj" } });

      await expect(getNeedsAttention(future)).resolves.toEqual([]);
    });
  });

  describe("dismissAttentionItem", () => {
    it("writes both a dismissal and a notification-read row in one transaction", async () => {
      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: past, userId: owner, objectId: "todo-obj" } });
      const key = dismissalKey("todo", "todo-1", past);

      await dismissAttentionItem(key);

      await expect(prisma.attentionDismissal.findUnique({ where: { userId_itemKey: { userId: owner, itemKey: key } } })).resolves.not.toBeNull();
      const reads = await prisma.notificationRead.findMany({ where: { userId: owner, todoId: "todo-1" } });
      expect(reads).toHaveLength(1);
      await expect(getNeedsAttention(future)).resolves.toEqual([]);
    });

    it("does nothing when the deadline in the key has already moved on", async () => {
      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: future, userId: owner, objectId: "todo-obj" } });
      const staleKey = dismissalKey("todo", "todo-1", past);

      await dismissAttentionItem(staleKey);

      await expect(prisma.attentionDismissal.findUnique({ where: { userId_itemKey: { userId: owner, itemKey: staleKey } } })).resolves.toBeNull();
    });

    it("refuses a milestone key outright -- milestones are not dismissible", async () => {
      await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
      await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
      await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Overdue", dueDate: past } });
      const key = dismissalKey("milestone", "milestone-1", past);

      await dismissAttentionItem(key);

      await expect(prisma.attentionDismissal.findMany({ where: { userId: owner } })).resolves.toEqual([]);
      const items = await getNeedsAttention(future);
      expect(items.map((item) => item.kind)).toEqual(["milestone"]);
    });

    it("never dismisses another account's item", async () => {
      await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Not yours", userId: stranger } });
      await prisma.todo.create({ data: { id: "todo-1", name: "Not yours", dueDate: past, userId: stranger, objectId: "todo-obj" } });
      const key = dismissalKey("todo", "todo-1", past);

      await dismissAttentionItem(key);

      await expect(prisma.attentionDismissal.findMany({ where: { todoId: "todo-1" } })).resolves.toEqual([]);
    });
  });
});
