import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  tx: {
    template: { findFirst: vi.fn(), update: vi.fn() },
    templateField: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    object: { count: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx) },
}));

import { updateTemplate } from "@/lib/data/templates";

const owner = { id: "owner-id" };

/**
 * KD-038's two structural rules -- at most one Due Date field, and no field
 * ever converts into or out of being one -- are meant to be enforced twice:
 * a UI that never offers the action, and this, the actual guarantee. These
 * exercise the guarantee directly, independent of whatever the UI does or
 * doesn't show.
 */
describe("updateTemplate: Due Date field rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue(owner);
    mocks.tx.template.findFirst.mockResolvedValue({ id: "template-1" });
    mocks.tx.object.count.mockResolvedValue(0);
  });

  it("refuses a submission with two Due Date fields", async () => {
    mocks.tx.templateField.findMany.mockResolvedValue([]);
    await expect(updateTemplate("template-1", "Renewals", [
      { label: "Renewal date", type: "DATE", isDueDate: true },
      { label: "Follow-up date", type: "DATE", isDueDate: true },
    ])).rejects.toThrow("A template can only have one Due Date field.");
    expect(mocks.tx.templateField.create).not.toHaveBeenCalled();
  });

  it("allows adding one new Due Date field when the template has none", async () => {
    mocks.tx.templateField.findMany.mockResolvedValue([]);
    await updateTemplate("template-1", "Renewals", [
      { label: "Renewal date", type: "DATE", isDueDate: true },
    ]);
    expect(mocks.tx.templateField.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ label: "Renewal date", type: "DATE", isDueDate: true }),
    }));
  });

  it("refuses turning an existing Due Date field back into an ordinary one", async () => {
    mocks.tx.templateField.findMany.mockResolvedValue([{ id: "field-1", type: "DATE", isDueDate: true }]);
    await expect(updateTemplate("template-1", "Renewals", [
      { id: "field-1", label: "Renewal date", type: "DATE", isDueDate: false },
    ])).rejects.toThrow("A field can't be turned into or out of the Due Date field.");
    expect(mocks.tx.templateField.update).not.toHaveBeenCalled();
  });

  it("refuses turning an existing ordinary field into a Due Date field", async () => {
    mocks.tx.templateField.findMany.mockResolvedValue([{ id: "field-1", type: "DATE", isDueDate: false }]);
    await expect(updateTemplate("template-1", "Renewals", [
      { id: "field-1", label: "Some date", type: "DATE", isDueDate: true },
    ])).rejects.toThrow("A field can't be turned into or out of the Due Date field.");
  });

  it("allows an ordinary save that never touches the existing Due Date field's status", async () => {
    mocks.tx.templateField.findMany.mockResolvedValue([{ id: "field-1", type: "DATE", isDueDate: true }]);
    await updateTemplate("template-1", "Renewals", [
      { id: "field-1", label: "Renewal date (renamed)", type: "DATE", isDueDate: true },
    ]);
    expect(mocks.tx.templateField.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "field-1" },
      data: expect.objectContaining({ label: "Renewal date (renamed)" }),
    }));
  });
});
