import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { cloneTemplate, createTemplate, deleteTemplate, getTemplate, getTemplateOptions, getTemplates, updateTemplate } from "@/lib/data/templates";
import type { TemplateFieldInput } from "@/lib/templates/parse";

/**
 * lib/data/templates.ts is the module a real Prisma bug already lived in
 * once (KD-039/040's saveTemplateFieldValues, unit-tested only against a
 * mocked client, which happily accepted a `deleteMany` inside a nested
 * `create` the real one rejects). These run every rule here -- type/removal
 * locking, the Due Date cap and immutability, cloning, deletion -- against a
 * real Postgres instance instead.
 */

const owner = "template-owner";
const other = "template-other-owner";

const field = (overrides: Partial<TemplateFieldInput> = {}): TemplateFieldInput => ({ label: "Field", type: "TEXT", ...overrides });

describe.sequential("the template data layer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Template", lastName: "Owner", email: "template-owner@example.test" },
        { id: other, firstName: "Other", lastName: "Owner", email: "template-other@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });

  describe("createTemplate", () => {
    it("creates an untitled template owned by the current user", async () => {
      const template = await createTemplate();

      expect(template).toMatchObject({ userId: owner, name: "Untitled template" });
      await expect(prisma.template.findUniqueOrThrow({ where: { id: template.id } })).resolves.toMatchObject({ userId: owner });
    });
  });

  describe("updateTemplate", () => {
    it("adds fields in the submitted order, assigning each a stable id", async () => {
      const template = await createTemplate();

      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" }), field({ label: "Amount", type: "NUMBER" })]);

      const saved = await prisma.templateField.findMany({ where: { templateId: template.id }, orderBy: { position: "asc" } });
      expect(saved.map(({ label, type, position }) => ({ label, type, position }))).toEqual([
        { label: "Provider", type: "TEXT", position: 0 },
        { label: "Amount", type: "NUMBER", position: 1 },
      ]);
    });

    it("updates an existing field in place rather than recreating it, keeping its id stable", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" })]);
      const [original] = await prisma.templateField.findMany({ where: { templateId: template.id } });

      await updateTemplate(template.id, "Renewals", [{ id: original.id, label: "Provider name", type: "TEXT" }]);

      const [updated] = await prisma.templateField.findMany({ where: { templateId: template.id } });
      expect(updated.id).toBe(original.id);
      expect(updated.label).toBe("Provider name");
    });

    it("removes a field genuinely absent from the submitted list", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" }), field({ label: "Amount" })]);
      const [keep] = await prisma.templateField.findMany({ where: { templateId: template.id }, orderBy: { position: "asc" } });

      await updateTemplate(template.id, "Renewals", [{ id: keep.id, label: keep.label, type: "TEXT" }]);

      await expect(prisma.templateField.findMany({ where: { templateId: template.id } })).resolves.toHaveLength(1);
    });

    it("refuses to update a template owned by someone else", async () => {
      mocks.requireKinesisUser.mockResolvedValue({ id: other });
      const template = await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: owner });

      await expect(updateTemplate(template.id, "Hijacked", [])).rejects.toThrow("This template no longer exists.");
    });

    it("refuses to retype or remove a field once an object follows the template", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" })]);
      const [existing] = await prisma.templateField.findMany({ where: { templateId: template.id } });
      await prisma.object.create({ data: { id: "in-use-object", type: "CUSTOM_ITEM", name: "Following", userId: owner, templateId: template.id } });

      await expect(updateTemplate(template.id, "Renewals", [{ id: existing.id, label: "Provider", type: "NUMBER" }]))
        .rejects.toThrow("This template is in use, so its fields can no longer be retyped or removed.");
      await expect(updateTemplate(template.id, "Renewals", []))
        .rejects.toThrow("This template is in use, so its fields can no longer be retyped or removed.");
    });

    it("still allows renaming and adding fields once a template is in use", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" })]);
      const [existing] = await prisma.templateField.findMany({ where: { templateId: template.id } });
      await prisma.object.create({ data: { id: "in-use-object-2", type: "CUSTOM_ITEM", name: "Following", userId: owner, templateId: template.id } });

      await updateTemplate(template.id, "Subscriptions", [{ id: existing.id, label: "Provider", type: "TEXT" }, field({ label: "Amount", type: "NUMBER" })]);

      await expect(prisma.template.findUniqueOrThrow({ where: { id: template.id } })).resolves.toMatchObject({ name: "Subscriptions" });
      await expect(prisma.templateField.findMany({ where: { templateId: template.id } })).resolves.toHaveLength(2);
    });

    it("allows at most one Due Date field", async () => {
      const template = await createTemplate();

      await expect(updateTemplate(template.id, "Renewals", [
        field({ label: "Due date", type: "DATE", isDueDate: true }),
        field({ label: "Renewal date", type: "DATE", isDueDate: true }),
      ])).rejects.toThrow("A template can only have one Due Date field.");
    });

    it("never lets an existing field turn into or out of the Due Date field", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Due date", type: "DATE", isDueDate: true }), field({ label: "Notes" })]);
      const rows = await prisma.templateField.findMany({ where: { templateId: template.id } });
      const dueDateField = rows.find((row) => row.isDueDate)!;
      const ordinaryField = rows.find((row) => !row.isDueDate)!;

      await expect(updateTemplate(template.id, "Renewals", [
        { id: dueDateField.id, label: "Due date", type: "DATE", isDueDate: false },
        { id: ordinaryField.id, label: "Notes", type: "TEXT" },
      ])).rejects.toThrow("A field can't be turned into or out of the Due Date field.");

      await expect(updateTemplate(template.id, "Renewals", [
        { id: dueDateField.id, label: "Due date", type: "DATE", isDueDate: true },
        { id: ordinaryField.id, label: "Notes", type: "DATE", isDueDate: true },
      ])).rejects.toThrow("A field can't be turned into or out of the Due Date field.");

      // Untouched, both rules having refused before anything was written.
      await expect(prisma.templateField.findMany({ where: { templateId: template.id } })).resolves.toEqual(rows);
    });

    it("refuses even once the Due Date field is in use -- unconditionally, not just under Decision 7's lock", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Due date", type: "DATE", isDueDate: true })]);
      const [dueDateField] = await prisma.templateField.findMany({ where: { templateId: template.id } });
      // Not in use -- the point is this refusal fires regardless.
      await expect(updateTemplate(template.id, "Renewals", [{ id: dueDateField.id, label: "Due date", type: "DATE", isDueDate: false }]))
        .rejects.toThrow("A field can't be turned into or out of the Due Date field.");
    });
  });

  describe("cloneTemplate", () => {
    it("copies every field, including isDueDate, onto a new independent template", async () => {
      const source = await createTemplate();
      await updateTemplate(source.id, "Renewals", [field({ label: "Provider" }), field({ label: "Due date", type: "DATE", isDueDate: true })]);

      const clone = await cloneTemplate(source.id, "Renewals copy");

      expect(clone).toMatchObject({ userId: owner, name: "Renewals copy" });
      const [sourceFields, cloneFields] = await Promise.all([
        prisma.templateField.findMany({ where: { templateId: source.id }, orderBy: { position: "asc" } }),
        prisma.templateField.findMany({ where: { templateId: clone.id }, orderBy: { position: "asc" } }),
      ]);
      expect(cloneFields.map(({ label, type, position, isDueDate }) => ({ label, type, position, isDueDate })))
        .toEqual(sourceFields.map(({ label, type, position, isDueDate }) => ({ label, type, position, isDueDate })));
      // Independent rows, not shared ones -- editing the source's fields later
      // must never reach the clone's.
      expect(cloneFields.map((row) => row.id)).not.toEqual(sourceFields.map((row) => row.id));
    });

    it("refuses to clone a template owned by someone else", async () => {
      mocks.requireKinesisUser.mockResolvedValue({ id: other });
      const template = await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: owner });

      await expect(cloneTemplate(template.id, "Stolen copy")).rejects.toThrow("This template no longer exists.");
    });
  });

  describe("deleteTemplate", () => {
    it("deletes a template that nothing follows, cascading its fields", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" })]);

      await deleteTemplate(template.id);

      await expect(prisma.template.findUnique({ where: { id: template.id } })).resolves.toBeNull();
      await expect(prisma.templateField.findMany({ where: { templateId: template.id } })).resolves.toEqual([]);
    });

    it("refuses to delete a template an object still follows", async () => {
      const template = await createTemplate();
      await prisma.object.create({ data: { id: "in-use-object-3", type: "CUSTOM_ITEM", name: "Following", userId: owner, templateId: template.id } });

      await expect(deleteTemplate(template.id)).rejects.toThrow("This template is in use and cannot be deleted.");
      await expect(prisma.template.findUnique({ where: { id: template.id } })).resolves.not.toBeNull();
    });

    it("does nothing for a template owned by someone else, rather than deleting it", async () => {
      mocks.requireKinesisUser.mockResolvedValue({ id: other });
      const template = await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: owner });

      await deleteTemplate(template.id);

      await expect(prisma.template.findUnique({ where: { id: template.id } })).resolves.not.toBeNull();
    });
  });

  describe("reads", () => {
    it("getTemplate reports field count, linked modules, and objects in use", async () => {
      const template = await createTemplate();
      await updateTemplate(template.id, "Renewals", [field({ label: "Provider" }), field({ label: "Amount" })]);
      await prisma.customModule.create({ data: { id: "linked-module", name: "Bills", normalizedName: "bills", icon: "star", color: "#111111", userId: owner, templateId: template.id } });
      await prisma.object.create({ data: { id: "in-use-object-4", type: "CUSTOM_ITEM", name: "Following", userId: owner, templateId: template.id } });

      const read = await getTemplate(template.id);

      expect(read).toMatchObject({ name: "Renewals", inUse: true, linkedModules: 1, usedByObjects: 1 });
      expect(read?.fields).toHaveLength(2);
    });

    it("getTemplate returns null for a template owned by someone else", async () => {
      mocks.requireKinesisUser.mockResolvedValue({ id: other });
      const template = await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: owner });

      await expect(getTemplate(template.id)).resolves.toBeNull();
    });

    it("getTemplates and getTemplateOptions only ever see the current user's own templates", async () => {
      const mine = await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: other });
      await createTemplate();
      mocks.requireKinesisUser.mockResolvedValue({ id: owner });

      await expect(getTemplates()).resolves.toEqual([expect.objectContaining({ id: mine.id })]);
      await expect(getTemplateOptions()).resolves.toEqual([{ id: mine.id, name: "Untitled template" }]);
    });
  });
});
