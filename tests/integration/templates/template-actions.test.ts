import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createTemplateAction, updateTemplateAction, cloneTemplateAction, deleteTemplateAction } from "@/app/(app)/settings/templates/actions";
import { TEMPLATE_FIELDS_FORM_KEY, TEMPLATE_PREVIEW_FIELDS_FORM_KEY } from "@/lib/templates/parse";

/**
 * lib/data/templates.ts's create/update/clone/delete functions already have
 * thorough coverage (tests/integration/templates/templates.test.ts), but
 * nothing exercised the actual server actions the settings page calls --
 * the FormData parsing (parseTemplateFields/parsePreviewFields reading the
 * exact keys the real field editor submits) and the try/catch that maps a
 * real save conflict to {error, conflict: true} rather than an unhandled
 * throw. That wiring is exactly the kind of seam a redesign can quietly
 * break without any data-layer test noticing (see the checkbox preview
 * regression this branch already fixed once).
 */

const owner = "template-actions-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

const form = (values: Record<string, string> = {}, fields?: Array<Record<string, unknown>>, previewFieldIds?: string[]) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (fields) data.set(TEMPLATE_FIELDS_FORM_KEY, JSON.stringify(fields));
  if (previewFieldIds) data.set(TEMPLATE_PREVIEW_FIELDS_FORM_KEY, JSON.stringify(previewFieldIds));
  return data;
};

describe.sequential("Templates server actions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Template", lastName: "Owner", email: "template-actions@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("createTemplateAction creates an untitled template and redirects to it", async () => {
    await createTemplateAction();
    const created = await prisma.template.findFirstOrThrow({ where: { userId: owner } });
    expect(mocks.redirect).toHaveBeenCalledWith(`/settings/templates/${created.id}`);
  });

  describe("updateTemplateAction", () => {
    it("saves a real name, fields, and preview field selection together", async () => {
      const template = await prisma.template.create({ data: { id: "update-template", userId: owner, name: "Untitled" } });

      const result = await updateTemplateAction(template.id, {}, form(
        { name: "Reading log", updatedAt: template.updatedAt.toISOString() },
        [{ label: "Author", type: "TEXT" }, { label: "Pages", type: "NUMBER" }],
      ));

      expect(result.error).toBeUndefined();
      expect(result.saved).toBe(true);
      const saved = await prisma.template.findUniqueOrThrow({ where: { id: template.id }, include: { fields: true } });
      expect(saved.name).toBe("Reading log");
      expect(saved.fields.map((f) => f.label).sort()).toEqual(["Author", "Pages"]);

      const authorField = saved.fields.find((f) => f.label === "Author")!;
      const preview = await updateTemplateAction(template.id, {}, form(
        { name: "Reading log", updatedAt: saved.updatedAt.toISOString() },
        saved.fields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
        [authorField.id],
      ));
      expect(preview.error).toBeUndefined();
      await expect(prisma.template.findUniqueOrThrow({ where: { id: template.id } })).resolves.toMatchObject({ previewFields: [authorField.id] });
    });

    it("rejects a missing name without writing anything", async () => {
      const template = await prisma.template.create({ data: { id: "unnamed-template", userId: owner, name: "Untitled" } });
      const result = await updateTemplateAction(template.id, {}, form({ name: "", updatedAt: template.updatedAt.toISOString() }));
      expect(result).toEqual({ error: "Enter a template name." });
    });

    it("refuses a missing or unparseable updatedAt rather than skipping the concurrency check", async () => {
      const template = await prisma.template.create({ data: { id: "no-stamp-template", userId: owner, name: "Untitled" } });
      const result = await updateTemplateAction(template.id, {}, form({ name: "Renamed" }));
      expect(result).toEqual({ error: "This template could not be identified. Reload and try again." });
    });

    /**
     * The regression this proves didn't happen: updateTemplate's own conflict
     * refusal has to survive the action's try/catch and come out as
     * {error, conflict: true}, not rethrown as an unhandled fault.
     */
    it("maps a real save conflict to {error, conflict: true} through the actual action", async () => {
      const template = await prisma.template.create({ data: { id: "conflict-template", userId: owner, name: "Untitled" } });
      await prisma.template.update({ where: { id: template.id }, data: { name: "Changed elsewhere" } });

      const result = await updateTemplateAction(template.id, {}, form({ name: "My edit", updatedAt: template.updatedAt.toISOString() }));
      expect(result).toMatchObject({ conflict: true });
      expect(result.error).toBeTruthy();
      await expect(prisma.template.findUniqueOrThrow({ where: { id: template.id } })).resolves.toMatchObject({ name: "Changed elsewhere" });
    });
  });

  describe("cloneTemplateAction", () => {
    it("clones a template's fields under a new name and redirects to the clone", async () => {
      const template = await prisma.template.create({ data: { id: "clone-source", userId: owner, name: "Original", fields: { create: [{ id: "clone-field", label: "Status", type: "TEXT", position: 0 }] } } });
      await cloneTemplateAction(template.id, {}, form({ name: "Copy of Original" }));

      const clone = await prisma.template.findFirstOrThrow({ where: { userId: owner, name: "Copy of Original" }, include: { fields: true } });
      expect(clone.fields.map((f) => f.label)).toEqual(["Status"]);
      expect(mocks.redirect).toHaveBeenCalledWith(`/settings/templates/${clone.id}`);
    });

    it("rejects a missing name for the copy, writing nothing", async () => {
      const template = await prisma.template.create({ data: { id: "clone-source-2", userId: owner, name: "Original" } });
      const result = await cloneTemplateAction(template.id, {}, form({ name: "" }));
      expect(result).toEqual({ error: "Enter a name for the copy." });
      await expect(prisma.template.count({ where: { userId: owner } })).resolves.toBe(1);
    });
  });

  describe("deleteTemplateAction", () => {
    it("deletes a template that's not in use", async () => {
      const template = await prisma.template.create({ data: { id: "deletable-template", userId: owner, name: "Unused" } });
      await deleteTemplateAction(template.id);
      await expect(prisma.template.findUnique({ where: { id: template.id } })).resolves.toBeNull();
      expect(mocks.redirect).toHaveBeenCalledWith("/settings/templates");
    });

    it("refuses to delete a template a real item still follows", async () => {
      const template = await prisma.template.create({ data: { id: "in-use-template", userId: owner, name: "In use" } });
      await prisma.customModule.create({ data: { id: "template-actions-module", userId: owner, name: "Habits", normalizedName: "habits", icon: "star", color: "#111111", templateId: template.id } });
      await prisma.object.create({ data: { id: "template-actions-item-obj", type: "CUSTOM_ITEM", userId: owner, name: "Meditate", templateId: template.id } });
      await prisma.customItem.create({ data: { id: "template-actions-item", name: "Meditate", moduleId: "template-actions-module", objectId: "template-actions-item-obj" } });

      const result = await deleteTemplateAction(template.id);
      expect(result?.error).toBeTruthy();
      await expect(prisma.template.findUnique({ where: { id: template.id } })).resolves.not.toBeNull();
    });
  });
});
