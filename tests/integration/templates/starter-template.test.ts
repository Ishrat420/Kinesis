import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/data/prisma";
import { ensureStarterTemplate } from "@/lib/data/starter-template";

/**
 * `ensureStarterTemplate` is the one template every Kinesis owner gets for
 * free (lib/auth.ts calls it from every branch of requireKinesisUser that
 * returns an owner). Run against a real Postgres instance, like the rest of
 * the template data layer, since the nested `fields: { create: [...] }`
 * write is exactly the shape that a mocked client would happily accept even
 * if malformed.
 */

const owner = "starter-template-owner";

describe.sequential("ensureStarterTemplate", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Starter", lastName: "Owner", email: "starter-owner@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("creates a General Record template, marked isStarter, with the four starter fields in order", async () => {
    await ensureStarterTemplate(prisma, owner);

    const template = await prisma.template.findFirstOrThrow({
      where: { userId: owner },
      include: { fields: { orderBy: { position: "asc" } } },
    });

    expect(template.name).toBe("General Record");
    expect(template.isStarter).toBe(true);
    expect(template.fields.map(({ label, type, isDueDate, multiline }) => ({ label, type, isDueDate, multiline }))).toEqual([
      { label: "Due date", type: "DATE", isDueDate: true, multiline: false },
      { label: "Reference", type: "LINK", isDueDate: false, multiline: false },
      { label: "Related", type: "KINESIS_LINK", isDueDate: false, multiline: false },
      { label: "Notes", type: "TEXT", isDueDate: false, multiline: true },
    ]);
  });

  it("works inside an existing transaction, the way requireKinesisUser calls it", async () => {
    await prisma.$transaction((tx) => ensureStarterTemplate(tx, owner));

    await expect(prisma.template.findFirst({ where: { userId: owner, isStarter: true } })).resolves.not.toBeNull();
  });

  it("does nothing when this owner already has a starter template -- backfilling an existing owner must not duplicate it", async () => {
    await ensureStarterTemplate(prisma, owner);

    await ensureStarterTemplate(prisma, owner);

    await expect(prisma.template.count({ where: { userId: owner } })).resolves.toBe(1);
  });

  it("still creates General Record even when the owner already has other templates of their own", async () => {
    await prisma.template.create({ data: { id: "custom-first-template", userId: owner, name: "My Own Template" } });

    await ensureStarterTemplate(prisma, owner);

    const templates = await prisma.template.findMany({ where: { userId: owner } });
    expect(templates.map((template) => template.name).sort()).toEqual(["General Record", "My Own Template"]);
  });

  it("does not add a second starter template once one already exists, even alongside other templates", async () => {
    await prisma.template.create({ data: { id: "custom-first-template", userId: owner, name: "My Own Template" } });
    await ensureStarterTemplate(prisma, owner);

    await ensureStarterTemplate(prisma, owner);

    await expect(prisma.template.count({ where: { userId: owner, isStarter: true } })).resolves.toBe(1);
  });

  it("recognises the starter template by isStarter, not by name, so renaming it never brings back a second one", async () => {
    await ensureStarterTemplate(prisma, owner);
    await prisma.template.updateMany({ where: { userId: owner, isStarter: true }, data: { name: "My Renamed Records" } });

    await ensureStarterTemplate(prisma, owner);

    const templates = await prisma.template.findMany({ where: { userId: owner } });
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: "My Renamed Records", isStarter: true });
  });
});
