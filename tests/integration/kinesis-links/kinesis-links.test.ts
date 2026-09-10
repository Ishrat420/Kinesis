import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkOptions, validateKinesisTargets } from "@/lib/data/kinesis-links";

/**
 * lib/data/kinesis-links.ts decides what a Kinesis Link field may point at,
 * and whether a submitted target is genuinely the owner's -- both read
 * across every object type through a single Object query, joined to
 * whichever typed record each object actually has. No unit test can
 * exercise those joins without a real database behind them.
 */

const owner = "kinesis-links-owner";
const stranger = "kinesis-links-stranger";

async function seedOneOfEach(userId: string, tag: string) {
  await prisma.object.create({ data: { id: `${tag}-doc-obj`, type: "DOCUMENT", name: "Passport", userId } });
  await prisma.document.create({ data: { id: `${tag}-doc`, name: "Passport", type: "Identity", status: "Active", owner: "Owner", userId, objectId: `${tag}-doc-obj` } });

  await prisma.object.create({ data: { id: `${tag}-goal-obj`, type: "GOAL", name: "Read more", userId } });
  await prisma.goal.create({ data: { id: `${tag}-goal`, name: "Read more", userId, objectId: `${tag}-goal-obj` } });

  await prisma.object.create({ data: { id: `${tag}-finance-obj`, type: "FINANCE_ITEM", name: "Savings", userId } });
  await prisma.financeItem.create({ data: { id: `${tag}-finance`, kind: "asset", name: "Savings", amount: 1, userId, objectId: `${tag}-finance-obj` } });

  await prisma.object.create({ data: { id: `${tag}-person-obj`, type: "PERSON", name: "Sam", userId } });
  await prisma.person.create({ data: { id: `${tag}-person`, name: "Sam", userId, objectId: `${tag}-person-obj` } });

  await prisma.object.create({ data: { id: `${tag}-todo-obj`, type: "TODO", name: "Renew passport", userId } });
  await prisma.todo.create({ data: { id: `${tag}-todo`, name: "Renew passport", userId, objectId: `${tag}-todo-obj` } });

  await prisma.customModule.create({ data: { id: `${tag}-module`, name: "Books", normalizedName: `${tag} books`, icon: "star", color: "#111111", userId } });
  await prisma.object.create({ data: { id: `${tag}-item-obj`, type: "CUSTOM_ITEM", name: "Dune", userId } });
  await prisma.customItem.create({ data: { id: `${tag}-item`, name: "Dune", moduleId: `${tag}-module`, objectId: `${tag}-item-obj` } });
}

describe.sequential("Kinesis Link targets", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Link", lastName: "Owner", email: "kinesis-links-owner@example.test" },
        { id: stranger, firstName: "S", lastName: "T", email: "kinesis-links-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("getKinesisLinkOptions", () => {
    it("resolves one object of every linkable type, in module order, with the right module name and route", async () => {
      await seedOneOfEach(owner, "o");

      const options = await getKinesisLinkOptions();

      expect(options).toEqual([
        { objectId: "o-doc-obj", type: "DOCUMENT", name: "Passport", module: "Documents", href: "/documents/o-doc", color: "#2563eb" },
        { objectId: "o-item-obj", type: "CUSTOM_ITEM", name: "Dune", module: "Books", href: "/custom-modules/o-module/items/o-item", icon: "star", color: "#111111" },
        { objectId: "o-goal-obj", type: "GOAL", name: "Read more", module: "Goals", href: "/goals/o-goal", color: "#7c3aed" },
        { objectId: "o-finance-obj", type: "FINANCE_ITEM", name: "Savings", module: "Finance", href: "/finance", color: "#059669" },
        { objectId: "o-person-obj", type: "PERSON", name: "Sam", module: "Relationships", href: "/relationships", color: "#e11d48" },
        { objectId: "o-todo-obj", type: "TODO", name: "Renew passport", module: "To-Dos", href: "/todos#todo-o-todo", color: "#0d9488" },
      ]);
    });

    it("orders same-type objects by name", async () => {
      await prisma.object.create({ data: { id: "goal-obj-b", type: "GOAL", name: "Zzz goal", userId: owner } });
      await prisma.goal.create({ data: { id: "goal-b", name: "Zzz goal", userId: owner, objectId: "goal-obj-b" } });
      await prisma.object.create({ data: { id: "goal-obj-a", type: "GOAL", name: "Aaa goal", userId: owner } });
      await prisma.goal.create({ data: { id: "goal-a", name: "Aaa goal", userId: owner, objectId: "goal-obj-a" } });

      const options = await getKinesisLinkOptions();

      expect(options.map((option) => option.name)).toEqual(["Aaa goal", "Zzz goal"]);
    });

    it("never offers another account's objects", async () => {
      await seedOneOfEach(owner, "o");
      await seedOneOfEach(stranger, "s");

      const options = await getKinesisLinkOptions();

      expect(options.every((option) => option.objectId.startsWith("o-"))).toBe(true);
      expect(options).toHaveLength(6);
    });

    /**
     * A precaution, not a live problem -- this account size is unrealistic --
     * but the read is unconditional on five page loads whether or not the
     * picker it feeds is ever opened, so it should not be able to grow
     * without bound.
     */
    it("never returns more than the sanity cap, however many linkable objects the account has", async () => {
      const count = 501;
      await prisma.object.createMany({ data: Array.from({ length: count }, (_, index) => ({ id: `bulk-goal-obj-${index}`, type: "GOAL" as const, name: `Bulk goal ${index}`, userId: owner })) });
      await prisma.goal.createMany({ data: Array.from({ length: count }, (_, index) => ({ id: `bulk-goal-${index}`, name: `Bulk goal ${index}`, userId: owner, objectId: `bulk-goal-obj-${index}` })) });

      const options = await getKinesisLinkOptions();

      expect(options).toHaveLength(500);
    });
  });

  describe("validateKinesisTargets", () => {
    it("passes fields with no target at all -- nothing to validate", async () => {
      await expect(validateKinesisTargets([{ targetObjectIds: [] }])).resolves.toBeNull();
      await expect(validateKinesisTargets([])).resolves.toBeNull();
    });

    it("passes when every target is owned by the current user", async () => {
      await seedOneOfEach(owner, "o");

      await expect(validateKinesisTargets([{ targetObjectIds: ["o-doc-obj", "o-goal-obj"] }])).resolves.toBeNull();
    });

    it("refuses when a target belongs to someone else", async () => {
      await seedOneOfEach(owner, "o");
      await seedOneOfEach(stranger, "s");

      await expect(validateKinesisTargets([{ targetObjectIds: ["o-doc-obj", "s-goal-obj"] }]))
        .resolves.toBe("One of the linked items no longer exists. Reopen the link field and choose again.");
    });

    it("refuses a target that has been deleted", async () => {
      await expect(validateKinesisTargets([{ targetObjectIds: ["never-existed"] }]))
        .resolves.toBe("One of the linked items no longer exists. Reopen the link field and choose again.");
    });

    it("checks targets across every field at once, deduplicated", async () => {
      await seedOneOfEach(owner, "o");

      await expect(validateKinesisTargets([
        { targetObjectIds: ["o-doc-obj"] },
        { targetObjectIds: ["o-doc-obj", "o-goal-obj"] },
      ])).resolves.toBeNull();
    });
  });
});
