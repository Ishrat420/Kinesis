import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { KinesisObjectType } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";

/**
 * The invariants asserted here live in prisma/migrations/20260903000000 as
 * PostgreSQL triggers, not in the Prisma schema. They exist only in a database
 * built from the migration history, so these tests also prove the integration
 * database is still being built that way (see scripts/reset-test-database.mjs).
 */

const userId = "object-integrity-owner";
const moduleId = "object-integrity-module";

/**
 * One creator per Object-backed model, so every case below runs against all
 * five rather than standing in for the others with Goal.
 */
const models = [
  {
    model: "Document" as const,
    type: "DOCUMENT" as KinesisObjectType,
    create: (id: string, name: string, objectId: string) =>
      prisma.document.create({ data: { id, name, objectId, userId, type: "Passport", status: "Active", owner: "Owner" } }),
    rename: (id: string, name: string) => prisma.document.update({ where: { id }, data: { name } }),
  },
  {
    model: "Goal" as const,
    type: "GOAL" as KinesisObjectType,
    create: (id: string, name: string, objectId: string) => prisma.goal.create({ data: { id, name, objectId, userId } }),
    rename: (id: string, name: string) => prisma.goal.update({ where: { id }, data: { name } }),
  },
  {
    model: "FinanceItem" as const,
    type: "FINANCE_ITEM" as KinesisObjectType,
    create: (id: string, name: string, objectId: string) =>
      prisma.financeItem.create({ data: { id, name, objectId, userId, kind: "asset", amount: 100 } }),
    rename: (id: string, name: string) => prisma.financeItem.update({ where: { id }, data: { name } }),
  },
  {
    model: "Person" as const,
    type: "PERSON" as KinesisObjectType,
    create: (id: string, name: string, objectId: string) => prisma.person.create({ data: { id, name, objectId, userId } }),
    rename: (id: string, name: string) => prisma.person.update({ where: { id }, data: { name } }),
  },
  {
    model: "CustomItem" as const,
    type: "CUSTOM_ITEM" as KinesisObjectType,
    create: (id: string, name: string, objectId: string) => prisma.customItem.create({ data: { id, name, objectId, moduleId } }),
    rename: (id: string, name: string) => prisma.customItem.update({ where: { id }, data: { name } }),
  },
];

/** A type that is deliberately not this model's own, to attach it to wrongly. */
const wrongTypeFor = (type: KinesisObjectType) => (type === "GOAL" ? "DOCUMENT" : "GOAL") as KinesisObjectType;

const makeObject = (id: string, type: KinesisObjectType, name: string) =>
  prisma.object.create({ data: { id, type, name, userId } });

describe.sequential("Universal Object integrity invariants", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: { id: userId, firstName: "Integrity", lastName: "Owner", email: "object-integrity@example.test" },
    });
    await prisma.customModule.create({
      data: { id: moduleId, userId, name: "Integrity", normalizedName: "integrity", icon: "star", color: "#111111" },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe("type integrity", () => {
    it.each(models)("rejects a $model attached to an Object of the wrong type", async ({ model, type, create }) => {
      const wrongType = wrongTypeFor(type);
      await makeObject("wrong-type-object", wrongType, "Mislabelled");

      await expect(create("wrong-type-record", "Mislabelled", "wrong-type-object")).rejects.toThrow(
        new RegExp(`${model} .* cannot attach to Object .* of type ${wrongType}: expected ${type}`),
      );

      // The Object survives; only the mismatched attachment was refused.
      await expect(prisma.object.findUnique({ where: { id: "wrong-type-object" } })).resolves.toMatchObject({ type: wrongType });
    });

    it.each(models)("accepts a $model attached to an Object of its own type", async ({ type, create }) => {
      await makeObject("right-type-object", type, "Correctly typed");

      const record = await create("right-type-record", "Correctly typed", "right-type-object");

      expect(record).toMatchObject({ id: "right-type-record", objectId: "right-type-object" });
    });

    it.each(models)("rejects retyping an Object that already has a $model attached", async ({ model, type, create }) => {
      await makeObject("retype-object", type, "Attached");
      await create("retype-record", "Attached", "retype-object");

      await expect(
        prisma.object.update({ where: { id: "retype-object" }, data: { type: wrongTypeFor(type) } }),
      ).rejects.toThrow(new RegExp(`Object .* has a ${type} record attached, so its type cannot become`));

      await expect(prisma.object.findUnique({ where: { id: "retype-object" } })).resolves.toMatchObject({ type });
      expect(model).toBeTruthy();
    });

    it("allows retyping an Object that has nothing attached", async () => {
      await makeObject("unattached-object", "GOAL", "Unattached");

      const retyped = await prisma.object.update({ where: { id: "unattached-object" }, data: { type: "DOCUMENT" } });

      expect(retyped.type).toBe("DOCUMENT");
    });
  });

  describe("name integrity", () => {
    it.each(models)("projects a $model rename onto Object.name", async ({ type, create, rename }) => {
      await makeObject("rename-object", type, "Original name");
      await create("rename-record", "Original name", "rename-object");

      await rename("rename-record", "Renamed");

      await expect(prisma.object.findUnique({ where: { id: "rename-object" } })).resolves.toMatchObject({ name: "Renamed" });
    });

    it.each(models)("rejects naming an Object something its $model is not called", async ({ type, create }) => {
      await makeObject("divergent-object", type, "Canonical");
      await create("divergent-record", "Canonical", "divergent-object");

      await expect(
        prisma.object.update({ where: { id: "divergent-object" }, data: { name: "Something else" } }),
      ).rejects.toThrow(/Object\.name is derived from the .* it belongs to/);

      await expect(prisma.object.findUnique({ where: { id: "divergent-object" } })).resolves.toMatchObject({ name: "Canonical" });
    });

    it.each(models)("allows a direct write of the canonical $model name", async ({ type, create }) => {
      await makeObject("canonical-object", type, "Canonical");
      await create("canonical-record", "Canonical", "canonical-object");

      const rewritten = await prisma.object.update({ where: { id: "canonical-object" }, data: { name: "Canonical" } });

      expect(rewritten.name).toBe("Canonical");
    });

    /**
     * saveRelationshipMap deletes every Person and recreates them against their
     * existing Object, so a rename arrives as a delete-then-insert rather than an
     * update. The sync trigger fires on that INSERT, and the name check has to
     * see the freshly inserted row rather than the name the Object still holds.
     */
    it("keeps Object.name when a record is detached and reattached under a new name", async () => {
      await makeObject("reattach-object", "PERSON", "Before");
      await prisma.person.create({ data: { id: "reattach-person", name: "Before", objectId: "reattach-object", userId } });

      await prisma.person.deleteMany({ where: { id: "reattach-person" } });
      await prisma.person.create({ data: { id: "reattach-person", name: "After", objectId: "reattach-object", userId } });

      await expect(prisma.object.findUnique({ where: { id: "reattach-object" } })).resolves.toMatchObject({ name: "After" });
    });

    it("rejects naming an Object whose typed record is missing", async () => {
      await makeObject("nameless-object", "GOAL", "Claims to be a goal");

      await expect(
        prisma.object.update({ where: { id: "nameless-object" }, data: { name: "New name" } }),
      ).rejects.toThrow(/claims type GOAL but no such record is attached/);
    });
  });
});
