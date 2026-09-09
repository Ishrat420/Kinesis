import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  validateKinesisTargets: vi.fn(),
  addActivity: vi.fn(),
  revalidatePath: vi.fn(),
  tx: {
    customItem: { create: vi.fn() },
    templateField: { findMany: vi.fn() },
    objectField: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  prisma: {
    customModule: { findFirst: vi.fn() },
    templateField: { findFirst: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: mocks.addActivity }));
vi.mock("@/lib/data/kinesis-links", () => ({ validateKinesisTargets: mocks.validateKinesisTargets }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    ...mocks.prisma,
    $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  },
}));

import { createCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";

const owner = { id: "owner-id" };

const form = (values: Record<string, string>, templateValues?: Array<Record<string, unknown>>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (templateValues) data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(templateValues));
  return data;
};

/**
 * KD-039: the item-creation dialog shows a template's fields from the
 * start, so `createCustomItemAction` has to write those values at creation
 * time rather than leaving every item to start blank and wait for a later
 * edit. The write path itself (`saveTemplateFieldValues`) already existed
 * for `updateCustomItemAction` (KD-035 Phase 3); these pin that creation
 * now calls it too, inside the same transaction as the item itself, and
 * that a Due Date field (KD-038) is routed to `CustomItem.dueDate` instead.
 */
describe("createCustomItemAction: template field values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue(owner);
    mocks.validateKinesisTargets.mockResolvedValue(null);
    mocks.tx.templateField.findMany.mockResolvedValue([
      { id: "field-notes", type: "TEXT" },
    ]);
    mocks.tx.objectField.findFirst.mockResolvedValue(null);
    mocks.tx.customItem.create.mockResolvedValue({ id: "item-1", objectId: "object-1" });
  });

  it("writes a submitted template field's value in the same transaction as creation", async () => {
    mocks.prisma.customModule.findFirst.mockResolvedValue({ id: "module-1", templateId: "template-1" });
    mocks.prisma.templateField.findFirst.mockResolvedValue(null);

    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Renew passport" },
      [{ templateFieldId: "field-notes", value: "Priority renewal", targetObjectIds: [] }],
    ));

    expect(result.error).toBeUndefined();
    expect(mocks.tx.objectField.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ objectId: "object-1", templateFieldId: "field-notes", value: "Priority renewal" }),
    }));
  });

  it("routes a template's Due Date field to CustomItem.dueDate, not ObjectField", async () => {
    mocks.prisma.customModule.findFirst.mockResolvedValue({ id: "module-1", templateId: "template-1" });
    mocks.prisma.templateField.findFirst.mockResolvedValue({ id: "field-due" });
    mocks.tx.templateField.findMany.mockResolvedValue([{ id: "field-due", type: "DATE" }]);

    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Renew passport" },
      [{ templateFieldId: "field-due", value: "2027-03-15", targetObjectIds: [] }],
    ));

    expect(result.error).toBeUndefined();
    expect(mocks.tx.customItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dueDate: new Date("2027-03-15T00:00:00.000Z") }),
    }));
    // Never also written as an (unused) ObjectField row.
    expect(mocks.tx.objectField.create).not.toHaveBeenCalled();
  });

  it("ignores the fixed due date input once the template supplies its own Due Date field", async () => {
    mocks.prisma.customModule.findFirst.mockResolvedValue({ id: "module-1", templateId: "template-1" });
    mocks.prisma.templateField.findFirst.mockResolvedValue({ id: "field-due" });
    mocks.tx.templateField.findMany.mockResolvedValue([{ id: "field-due", type: "DATE" }]);

    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Renew passport", dueDate: "2020-01-01" },
      [{ templateFieldId: "field-due", value: "2027-03-15", targetObjectIds: [] }],
    ));

    expect(result.error).toBeUndefined();
    expect(mocks.tx.customItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dueDate: new Date("2027-03-15T00:00:00.000Z") }),
    }));
  });

  it("rejects an invalid value in the template's Due Date field", async () => {
    mocks.prisma.customModule.findFirst.mockResolvedValue({ id: "module-1", templateId: "template-1" });
    mocks.prisma.templateField.findFirst.mockResolvedValue({ id: "field-due" });

    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Renew passport" },
      [{ templateFieldId: "field-due", value: "not a date", targetObjectIds: [] }],
    ));

    expect(result).toEqual({ error: "Enter a valid due date." });
    expect(mocks.tx.customItem.create).not.toHaveBeenCalled();
  });

  it("leaves an item with no template unaffected", async () => {
    mocks.prisma.customModule.findFirst.mockResolvedValue({ id: "module-1", templateId: null });

    const result = await createCustomItemAction("module-1", {}, form({ name: "Loose item" }));

    expect(result.error).toBeUndefined();
    expect(mocks.prisma.templateField.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.objectField.create).not.toHaveBeenCalled();
  });
});
