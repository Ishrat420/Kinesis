import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { KinesisObjectType } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";

/**
 * An Object and the record attached to it must belong to the same account.
 * Object.objectId cascades, so a record attached across accounts is not merely
 * untidy: the Object's owner deleting their data would delete the other
 * account's record with it. Enforced in prisma/migrations/20260904000000.
 */

const owner = "ownership-owner";
const stranger = "ownership-stranger";
const moduleFor = (userId: string) => `module-${userId}`;

const models = [
  {
    model: "Document" as const,
    type: "DOCUMENT" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) =>
      prisma.document.create({ data: { id, name: "N", objectId, userId, type: "Passport", status: "Active", owner: "O" } }),
    reown: (id: string, userId: string) => prisma.document.update({ where: { id }, data: { userId } }),
    count: (userId: string) => prisma.document.count({ where: { userId } }),
  },
  {
    model: "Goal" as const,
    type: "GOAL" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) => prisma.goal.create({ data: { id, name: "N", objectId, userId } }),
    reown: (id: string, userId: string) => prisma.goal.update({ where: { id }, data: { userId } }),
    count: (userId: string) => prisma.goal.count({ where: { userId } }),
  },
  {
    model: "FinanceItem" as const,
    type: "FINANCE_ITEM" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) =>
      prisma.financeItem.create({ data: { id, name: "N", objectId, userId, kind: "asset", amount: 1 } }),
    reown: (id: string, userId: string) => prisma.financeItem.update({ where: { id }, data: { userId } }),
    count: (userId: string) => prisma.financeItem.count({ where: { userId } }),
  },
  {
    model: "Person" as const,
    type: "PERSON" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) => prisma.person.create({ data: { id, name: "N", objectId, userId } }),
    reown: (id: string, userId: string) => prisma.person.update({ where: { id }, data: { userId } }),
    count: (userId: string) => prisma.person.count({ where: { userId } }),
  },
  {
    // Owned through the module holding it rather than a userId of its own, so
    // "moving it to another account" means moving it to another account's module.
    model: "CustomItem" as const,
    type: "CUSTOM_ITEM" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) =>
      prisma.customItem.create({ data: { id, name: "N", objectId, moduleId: moduleFor(userId) } }),
    reown: (id: string, userId: string) => prisma.customItem.update({ where: { id }, data: { moduleId: moduleFor(userId) } }),
    count: (userId: string) => prisma.customItem.count({ where: { module: { userId } } }),
  },
  {
    model: "Todo" as const,
    type: "TODO" as KinesisObjectType,
    create: (id: string, objectId: string, userId: string) => prisma.todo.create({ data: { id, name: "N", objectId, userId } }),
    reown: (id: string, userId: string) => prisma.todo.update({ where: { id }, data: { userId } }),
    count: (userId: string) => prisma.todo.count({ where: { userId } }),
  },
];

const makeObject = (id: string, type: KinesisObjectType, userId: string) =>
  prisma.object.create({ data: { id, type, name: "N", userId } });

describe.sequential("Object ownership integrity", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Own", lastName: "Er", email: "ownership-owner@example.test" },
        { id: stranger, firstName: "Strange", lastName: "Er", email: "ownership-stranger@example.test" },
      ],
    });
    await prisma.customModule.createMany({
      data: [owner, stranger].map((userId) => ({
        id: moduleFor(userId), name: "Books", normalizedName: `books-${userId}`, icon: "star", color: "#111111", userId,
      })),
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("attaching", () => {
    it.each(models)("accepts a $model attached to an Object of the same account", async ({ type, create }) => {
      await makeObject("same-owner", type, owner);

      const record = await create("same-owner-record", "same-owner", owner);

      expect(record).toMatchObject({ id: "same-owner-record", objectId: "same-owner" });
    });

    it.each(models)("rejects a $model attached to another account's Object", async ({ model, type, create }) => {
      await makeObject("their-object", type, stranger);

      await expect(create("crossing-record", "their-object", owner)).rejects.toThrow(
        new RegExp(`${model} .* is owned by ${owner} and cannot attach to Object .* owned by ${stranger}`),
      );
      await expect(prisma.object.findUnique({ where: { id: "their-object" } })).resolves.toMatchObject({ userId: stranger });
    });
  });

  describe("moving either side afterwards", () => {
    it.each(models)("rejects moving an attached $model to another account", async ({ type, create, reown }) => {
      await makeObject("attached", type, owner);
      await create("attached-record", "attached", owner);

      await expect(reown("attached-record", stranger)).rejects.toThrow(/is owned by|cannot attach to Object/);
    });

    it.each(models)("rejects moving an Object that has a $model attached", async ({ model, type, create }) => {
      await makeObject("moving", type, owner);
      await create("moving-record", "moving", owner);

      await expect(prisma.object.update({ where: { id: "moving" }, data: { userId: stranger } })).rejects.toThrow(
        new RegExp(`Object .* has a ${model} owned by ${owner}, so it cannot move to ${stranger}`),
      );
      await expect(prisma.object.findUnique({ where: { id: "moving" } })).resolves.toMatchObject({ userId: owner });
    });

    it("allows moving an Object that has nothing attached", async () => {
      await makeObject("unattached", "GOAL", owner);

      await expect(prisma.object.update({ where: { id: "unattached" }, data: { userId: stranger } })).resolves.toMatchObject({
        userId: stranger,
      });
    });

    /** CustomItem's owner is the module's, so re-owning a module moves every item in it. */
    it("rejects moving a CustomModule that would strand its items' Objects", async () => {
      await makeObject("module-item", "CUSTOM_ITEM", owner);
      await prisma.customItem.create({ data: { id: "module-item-record", name: "N", objectId: "module-item", moduleId: moduleFor(owner) } });

      await expect(
        prisma.customModule.update({ where: { id: moduleFor(owner) }, data: { userId: stranger } }),
      ).rejects.toThrow(/CustomModule .* item\(s\) whose Object is owned by someone else/);
    });

    it("allows moving a CustomModule that holds no items", async () => {
      await expect(
        prisma.customModule.update({ where: { id: moduleFor(owner) }, data: { userId: stranger } }),
      ).resolves.toMatchObject({ userId: stranger });
    });
  });

  describe("cascade containment", () => {
    it.each(models)("cannot delete another account's $model by deleting its own Objects", async ({ type, create, count }) => {
      // Each account gets its own Object and its own record, correctly paired.
      await makeObject("mine", type, owner);
      await create("mine-record", "mine", owner);
      await makeObject("theirs", type, stranger);
      await create("theirs-record", "theirs", stranger);

      await prisma.object.deleteMany({ where: { userId: owner } });

      await expect(count(owner)).resolves.toBe(0);
      await expect(count(stranger)).resolves.toBe(1);
    });

    it("leaves every other account untouched when one deletes all of its Objects", async () => {
      for (const { type, create } of models) {
        await makeObject(`mine-${type}`, type, owner);
        await create(`mine-${type}-record`, `mine-${type}`, owner);
        await makeObject(`theirs-${type}`, type, stranger);
        await create(`theirs-${type}-record`, `theirs-${type}`, stranger);
      }

      await prisma.object.deleteMany({ where: { userId: owner } });

      await expect(prisma.object.count({ where: { userId: owner } })).resolves.toBe(0);
      await expect(prisma.object.count({ where: { userId: stranger } })).resolves.toBe(models.length);
      for (const { count } of models) await expect(count(stranger)).resolves.toBe(1);
    });
  });
});
