import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  prisma: {
    customItem: { findFirst: vi.fn() },
    templateField: { findMany: vi.fn() },
    objectField: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));

import { getCustomItem } from "@/lib/data/custom-modules";

const owner = { id: "owner-id" };

/**
 * `getCustomItem` merges a template's *current* field list with whatever
 * this one object has stored under each field -- the core mechanism KD-035
 * Phase 3 introduces. These pin the two shapes that mechanism has to get
 * right: a field with a stored value, and a field with none yet.
 */
describe("getCustomItem template field merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue(owner);
  });

  it("merges template fields with this object's stored values, in template order", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house",
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-date", templateId: "template-1", label: "Date", type: "DATE", position: 0 },
      { id: "field-why", templateId: "template-1", label: "Why?", type: "TEXT", position: 1 },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([
      { id: "value-1", objectId: "object-1", templateFieldId: "field-why", label: "", type: "TEXT", value: "Cheaper than renting", position: 0, links: [] },
    ]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateId).toBe("template-1");
    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-date", label: "Date", type: "DATE", value: "", targetObjectIds: [] },
      { templateFieldId: "field-why", label: "Why?", type: "TEXT", value: "Cheaper than renting", targetObjectIds: [] },
    ]);
  });

  it("carries a Kinesis Link template field's targets through", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house",
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-links", templateId: "template-1", label: "Kinesis Links", type: "KINESIS_LINK", position: 0 },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([
      { id: "value-1", objectId: "object-1", templateFieldId: "field-links", label: "", type: "KINESIS_LINK", value: "", position: 0, links: [{ id: "link-1", fieldId: "value-1", targetObjectId: "goal-object-1", position: 0 }] },
    ]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-links", label: "Kinesis Links", type: "KINESIS_LINK", value: "", targetObjectIds: ["goal-object-1"] },
    ]);
  });

  it("returns no template fields for an item that doesn't follow a template", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Loose item",
      module: { id: "module-1", name: "Miscellany" },
      object: { templateId: null, fields: [] },
    });

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateId).toBeNull();
    expect(item?.templateFields).toEqual([]);
    expect(mocks.prisma.templateField.findMany).not.toHaveBeenCalled();
  });

  it("keeps template-linked rows out of the plain extras list", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house",
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [{ id: "extra-1", objectId: "object-1", templateFieldId: null, label: "Warranty", type: "TEXT", value: "2 years", position: 0, links: [] }] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.fields).toEqual([expect.objectContaining({ id: "extra-1", label: "Warranty", value: "2 years" })]);
  });
});
