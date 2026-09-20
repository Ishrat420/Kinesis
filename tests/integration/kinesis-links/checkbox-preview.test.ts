import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { createTemplate, updateTemplate, getTemplate, getTemplateFieldSample } from "@/lib/data/templates";
import { getKinesisLinkPreviews } from "@/lib/data/kinesis-links";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";

/**
 * KD-042's checkbox preview, through the real write path and both real read
 * paths at once. A CHECKBOX field the person never actually toggles gets no
 * ObjectField row at all -- saveTemplateFieldValues treats the submitted ""
 * (TemplateFieldValues' checkbox starts unset; nothing writes "true"/"false"
 * to it until it's clicked) as nothing to persist, the same as any other
 * empty field. This proves neither preview reader mistakes that missing row
 * for "nothing to show" the way a missing TEXT or NUMBER row correctly does:
 * a checkbox's unchecked state is real data, not an absence of it.
 *
 * The client-side settings-page preview's own handling of this exact missing
 * shape is unit-tested directly (resolvePreviewFieldRaw, in
 * tests/unit/preview-kinds.test.ts) -- this is the server half of that same
 * regression, proving the real linked card (getKinesisLinkPreviews) and the
 * sample data handed to the settings page (getTemplateFieldSample) are both
 * fed the exact row shape -- or absence of one -- the real create action
 * actually leaves behind, rather than trusting the seam between them.
 */

const owner = "checkbox-preview-owner";

const form = (values: Record<string, string>, templateValues: Array<Record<string, unknown>>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(templateValues));
  return data;
};

describe.sequential("a template CHECKBOX field never toggled by the person", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Checkbox", lastName: "Owner", email: "checkbox-preview@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("writes no ObjectField row for it, yet the real card and the settings-page sample both still read it as false", async () => {
    const template = await createTemplate();
    await updateTemplate(template.id, "Habit tracker", [{ label: "Done today", type: "CHECKBOX" }], template.updatedAt);
    const afterFields = await getTemplate(template.id);
    const checkboxField = afterFields!.fields.find((f) => f.label === "Done today")!;

    // Mark it as a preview field -- the exact setup the settings page needs
    // to show it at all, saved as its own separate step the way the real
    // "Show on card" picker does.
    await updateTemplate(
      template.id,
      "Habit tracker",
      afterFields!.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, isDueDate: f.isDueDate, numberFormat: f.numberFormat ?? undefined, multiline: f.multiline })),
      afterFields!.updatedAt,
      [checkboxField.id],
    );

    await prisma.customModule.create({ data: { id: "habit-module", userId: owner, name: "Habits", normalizedName: "habits", icon: "star", color: "#111111", templateId: template.id } });

    // The real create action, submitting the checkbox exactly as the
    // component does before it's ever clicked: value "" -- TemplateFieldValues'
    // `checked={field.value === "true"}` never writes "true"/"false" to it
    // until the person actually toggles it.
    const result = await createCustomItemAction("habit-module", {}, form(
      { name: "Meditate" },
      [{ templateFieldId: checkboxField.id, value: "", targetObjectIds: [] }],
    ));
    expect(result.error).toBeUndefined();

    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Meditate" }, select: { id: true, objectId: true } });

    // The write side of the regression: confirms the premise everything else
    // here depends on -- an untouched checkbox really does leave no row.
    await expect(prisma.objectField.findFirst({ where: { objectId: item.objectId, templateFieldId: checkboxField.id } })).resolves.toBeNull();

    // The real linked card was always correct here (it already defaults a
    // missing value to "" before formatting), but had no test proving it for
    // CHECKBOX specifically until now.
    const cardPreviews = await getKinesisLinkPreviews([item.objectId]);
    expect(cardPreviews[item.objectId]).toEqual([{ label: "Done today", kind: "boolean", value: "False" }]);

    // The settings page's own sample data: confirms the exact input shape --
    // no entry at all for this field id -- that resolvePreviewFieldRaw is
    // unit-tested to turn into "False" rather than silently dropping.
    const sample = await getTemplateFieldSample(template.id);
    expect(sample?.values[checkboxField.id]).toBeUndefined();
  });

  it("still writes and previews a real value once the checkbox is actually toggled", async () => {
    const template = await createTemplate();
    await updateTemplate(template.id, "Habit tracker", [{ label: "Done today", type: "CHECKBOX" }], template.updatedAt);
    const afterFields = await getTemplate(template.id);
    const checkboxField = afterFields!.fields.find((f) => f.label === "Done today")!;
    await updateTemplate(
      template.id, "Habit tracker",
      afterFields!.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, isDueDate: f.isDueDate, numberFormat: f.numberFormat ?? undefined, multiline: f.multiline })),
      afterFields!.updatedAt, [checkboxField.id],
    );
    await prisma.customModule.create({ data: { id: "habit-module-2", userId: owner, name: "Habits 2", normalizedName: "habits 2", icon: "star", color: "#111111", templateId: template.id } });

    await createCustomItemAction("habit-module-2", {}, form(
      { name: "Stretch" },
      [{ templateFieldId: checkboxField.id, value: "true", targetObjectIds: [] }],
    ));
    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Stretch" }, select: { id: true, objectId: true } });

    await expect(prisma.objectField.findFirst({ where: { objectId: item.objectId, templateFieldId: checkboxField.id } })).resolves.toMatchObject({ value: "true" });

    const cardPreviews = await getKinesisLinkPreviews([item.objectId]);
    expect(cardPreviews[item.objectId]).toEqual([{ label: "Done today", kind: "boolean", value: "True" }]);
  });
});
