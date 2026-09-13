import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkPreviews } from "@/lib/data/kinesis-links";
import { createTemplate, updateTemplate, getTemplate } from "@/lib/data/templates";

/**
 * KD-042's rich preview cards, end to end through the real save path: a
 * Template's fields, then its "Show on card" picker, then a Custom Item
 * created under it with values, then the batched fetch a linked card's page
 * actually calls. Each of those was verified in isolation elsewhere, but a
 * bug report against the real app pointed at this exact chain, so it's worth
 * one test that walks all of it together rather than trusting the seams.
 */

const owner = "preview-e2e-owner";

describe.sequential("KD-042 preview cards, end to end", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Repro", lastName: "Owner", email: "preview-e2e@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("shows a linked Custom Item's configured fields, formatted, on another object's card", async () => {
    // 1. Create a template, add fields (mirrors the field editor's own save).
    const template = await createTemplate();
    await updateTemplate(template.id, "Repro Template", [
      { label: "Status", type: "TEXT" },
      { label: "Price", type: "NUMBER", numberFormat: "CURRENCY" },
    ]);
    const afterFields = await getTemplate(template.id);
    const statusField = afterFields!.fields.find((f) => f.label === "Status")!;
    const priceField = afterFields!.fields.find((f) => f.label === "Price")!;

    // 2. Save the "Show on card" picker as its own, separate save -- the
    // real UI flow, and the one the bug report specifically described.
    await updateTemplate(
      template.id,
      "Repro Template",
      afterFields!.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, isDueDate: f.isDueDate, numberFormat: f.numberFormat ?? undefined, multiline: f.multiline })),
      [statusField.id, priceField.id],
    );
    expect((await getTemplate(template.id))!.previewFields).toEqual([statusField.id, priceField.id]);

    // 3. Create a module using that template, and an item X under it.
    await prisma.customModule.create({ data: { id: "repro-module", name: "Repro Module", normalizedName: "repro module", icon: "star", color: "#111111", userId: owner, templateId: template.id } });
    await prisma.object.create({ data: { id: "repro-x-obj", type: "CUSTOM_ITEM", name: "Item X", userId: owner, templateId: template.id } });
    await prisma.customItem.create({ data: { id: "repro-x", name: "Item X", moduleId: "repro-module", objectId: "repro-x-obj" } });

    // 4. Fill in X's values, the way saveTemplateFieldValues does on create.
    await prisma.objectField.create({ data: { id: "repro-x-status", objectId: "repro-x-obj", label: "Status", value: "In progress", type: "TEXT", position: 0, templateFieldId: statusField.id } });
    await prisma.objectField.create({ data: { id: "repro-x-price", objectId: "repro-x-obj", label: "Price", value: "2140", type: "NUMBER", position: 1, templateFieldId: priceField.id } });

    // 5. Fetch previews the way a linking object's page does, for X's id
    // among a batch that also includes an object with no preview config.
    await prisma.object.create({ data: { id: "repro-plain-obj", type: "CUSTOM_ITEM", name: "No Template", userId: owner } });

    const previews = await getKinesisLinkPreviews(["repro-x-obj", "repro-plain-obj"]);

    expect(previews["repro-x-obj"]).toEqual([
      { label: "Status", kind: "text", value: "In progress" },
      { label: "Price", kind: "currency", value: "$2,140" },
    ]);
    // No template, no config -- absent from the map entirely, not an empty array.
    expect(previews["repro-plain-obj"]).toBeUndefined();
  });
});
