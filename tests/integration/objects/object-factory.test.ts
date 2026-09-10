import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/data/prisma";
import { deleteObjects, objectFor } from "@/lib/data/objects";

/**
 * objectFor is the one place every typed record's Object identity gets
 * built, and deleteObjects the one place an identity (and everything
 * cascading off it) gets torn down. Both are trivial-looking wrappers
 * around a nested Prisma write -- exactly the shape that looked fine
 * mocked and broke for real (KD-039/040's saveTemplateFieldValues). These
 * exercise every objectFor entry and deleteObjects's ownership scope
 * against a real database rather than trusting the shape.
 */

const owner = "object-factory-owner";
const stranger = "object-factory-stranger";

describe.sequential("the Object identity factory", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Object", lastName: "Owner", email: "object-factory-owner@example.test" },
        { id: stranger, firstName: "S", lastName: "T", email: "object-factory-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("objectFor.document creates an Object identity a Document can attach to, with its extra fields nested in", async () => {
    await prisma.document.create({
      data: {
        id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", user: { connect: { id: owner } },
        object: objectFor.document("Passport", owner, [{ id: "doc-1-field", label: "Number", value: "X123" }]),
      },
    });

    const document = await prisma.document.findUniqueOrThrow({ where: { id: "doc-1" }, include: { object: { include: { fields: true } } } });
    expect(document.object).toMatchObject({ type: "DOCUMENT", name: "Passport", userId: owner });
    expect(document.object.fields).toEqual([expect.objectContaining({ label: "Number", value: "X123" })]);
  });

  it("objectFor.goal, .financeItem, .person, .todo each create a correctly typed identity", async () => {
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", user: { connect: { id: owner } }, object: objectFor.goal("Read more", owner) } });
    await prisma.financeItem.create({ data: { id: "finance-1", kind: "asset", name: "Savings", amount: 1, user: { connect: { id: owner } }, object: objectFor.financeItem("Savings", owner) } });
    await prisma.person.create({ data: { id: "person-1", name: "Sam", user: { connect: { id: owner } }, object: objectFor.person("Sam", owner) } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", user: { connect: { id: owner } }, object: objectFor.todo("Renew passport", owner) } });

    const objects = await prisma.object.findMany({ where: { userId: owner }, orderBy: { name: "asc" } });
    expect(objects.map(({ type, name }) => ({ type, name }))).toEqual([
      { type: "FINANCE_ITEM", name: "Savings" },
      { type: "TODO", name: "Renew passport" },
      { type: "GOAL", name: "Read more" },
      { type: "PERSON", name: "Sam" },
    ].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it("objectFor.customItem stamps the template it follows onto the identity", async () => {
    const template = await prisma.template.create({ data: { id: "template-1", userId: owner, name: "Reading log" } });
    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner, templateId: template.id } });
    await prisma.customItem.create({
      data: { id: "item-1", name: "Dune", module: { connect: { id: "module-1" } }, object: objectFor.customItem("Dune", owner, undefined, template.id) },
    });

    const item = await prisma.customItem.findUniqueOrThrow({ where: { id: "item-1" }, include: { object: true } });
    expect(item.object).toMatchObject({ type: "CUSTOM_ITEM", templateId: template.id });
  });

  it("objectFor.customItem without a template leaves templateId null", async () => {
    await prisma.customModule.create({ data: { id: "module-2", name: "Movies", normalizedName: "movies", icon: "star", color: "#111111", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-2", name: "Arrival", module: { connect: { id: "module-2" } }, object: objectFor.customItem("Arrival", owner) } });

    const item = await prisma.customItem.findUniqueOrThrow({ where: { id: "item-2" }, include: { object: true } });
    expect(item.object.templateId).toBeNull();
  });

  it("deleteObjects removes the identity and cascades to the typed record hanging off it", async () => {
    await prisma.goal.create({ data: { id: "goal-2", name: "Learn Spanish", user: { connect: { id: owner } }, object: objectFor.goal("Learn Spanish", owner) } });
    const goal = await prisma.goal.findUniqueOrThrow({ where: { id: "goal-2" } });

    await deleteObjects(prisma, [goal.objectId], owner);

    await expect(prisma.object.findUnique({ where: { id: goal.objectId } })).resolves.toBeNull();
    await expect(prisma.goal.findUnique({ where: { id: "goal-2" } })).resolves.toBeNull();
  });

  it("deleteObjects never removes an identity belonging to someone else", async () => {
    await prisma.goal.create({ data: { id: "goal-3", name: "Not yours", user: { connect: { id: stranger } }, object: objectFor.goal("Not yours", stranger) } });
    const goal = await prisma.goal.findUniqueOrThrow({ where: { id: "goal-3" } });

    await deleteObjects(prisma, [goal.objectId], owner);

    await expect(prisma.object.findUnique({ where: { id: goal.objectId } })).resolves.not.toBeNull();
  });

  it("deleteObjects removes several identities of different types in one call", async () => {
    await prisma.goal.create({ data: { id: "goal-4", name: "A", user: { connect: { id: owner } }, object: objectFor.goal("A", owner) } });
    await prisma.person.create({ data: { id: "person-2", name: "B", user: { connect: { id: owner } }, object: objectFor.person("B", owner) } });
    const [goal, person] = await Promise.all([
      prisma.goal.findUniqueOrThrow({ where: { id: "goal-4" } }),
      prisma.person.findUniqueOrThrow({ where: { id: "person-2" } }),
    ]);

    await deleteObjects(prisma, [goal.objectId, person.objectId], owner);

    await expect(prisma.object.findMany({ where: { id: { in: [goal.objectId, person.objectId] } } })).resolves.toEqual([]);
  });
});
