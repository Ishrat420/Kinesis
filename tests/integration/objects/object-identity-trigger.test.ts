import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/data/prisma";

/**
 * kinesis_sync_object_name (prisma/migrations/20260902000000_object_capability_layer)
 * is raw SQL, not part of the Prisma schema. `prisma db push` never applies it, so
 * this only passes when the test database was built from the real migration
 * history (see scripts/reset-test-database.mjs) rather than pushed from the schema.
 */
describe.sequential("Object identity trigger (kinesis_sync_object_name)", () => {
  const userId = "object-trigger-owner";

  beforeEach(async () => {
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.object.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: { id: userId, firstName: "Trigger", lastName: "Owner", email: "object-trigger@example.test" },
    });
  });

  afterAll(async () => {
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.object.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("seeds Object.name from the typed record on create, then keeps it synced on rename", async () => {
    const goal = await prisma.goal.create({
      data: {
        id: crypto.randomUUID(),
        user: { connect: { id: userId } },
        name: "Buy a house",
        object: { create: { type: "GOAL", name: "Buy a house", userId } },
      },
    });

    const created = await prisma.object.findUniqueOrThrow({ where: { id: goal.objectId } });
    expect(created.name).toBe("Buy a house");

    await prisma.goal.update({ where: { id: goal.id }, data: { name: "Buy a bigger house" } });

    const renamed = await prisma.object.findUniqueOrThrow({ where: { id: goal.objectId } });
    expect(renamed.name).toBe("Buy a bigger house");
  });
});
