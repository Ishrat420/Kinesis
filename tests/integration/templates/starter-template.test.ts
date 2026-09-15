import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/data/prisma";
import { createStarterTemplate } from "@/lib/data/starter-template";

/**
 * `createStarterTemplate` is the one template a brand-new Kinesis deployment
 * gets for free (lib/auth.ts's true first-provisioning branch). Run against a
 * real Postgres instance, like the rest of the template data layer, since the
 * nested `fields: { create: [...] }` write is exactly the shape that a mocked
 * client would happily accept even if malformed.
 */

const owner = "starter-template-owner";

describe.sequential("createStarterTemplate", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Starter", lastName: "Owner", email: "starter-owner@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("creates a General Record template with the four starter fields in order", async () => {
    await createStarterTemplate(prisma, owner);

    const template = await prisma.template.findFirstOrThrow({
      where: { userId: owner },
      include: { fields: { orderBy: { position: "asc" } } },
    });

    expect(template.name).toBe("General Record");
    expect(template.fields.map(({ label, type, isDueDate, multiline }) => ({ label, type, isDueDate, multiline }))).toEqual([
      { label: "Due date", type: "DATE", isDueDate: true, multiline: false },
      { label: "Reference", type: "LINK", isDueDate: false, multiline: false },
      { label: "Related", type: "KINESIS_LINK", isDueDate: false, multiline: false },
      { label: "Notes", type: "TEXT", isDueDate: false, multiline: true },
    ]);
  });

  it("works inside an existing transaction, the way first-time provisioning calls it", async () => {
    await prisma.$transaction((tx) => createStarterTemplate(tx, owner));

    await expect(prisma.template.findFirst({ where: { userId: owner, name: "General Record" } })).resolves.not.toBeNull();
  });
});
