import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  prisma: {
    customItem: { findFirst: vi.fn() },
    templateField: { findMany: vi.fn() },
    objectField: { findMany: vi.fn() },
    // KD-023: a Kinesis Link field's targets are Kinesis Links.
    objectRelationship: { findMany: vi.fn() },
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
    mocks.prisma.objectRelationship.findMany.mockResolvedValue([]);
  });

  it("merges template fields with this object's stored values, in template order", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house", dueDate: null,
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-date", templateId: "template-1", label: "Date", type: "DATE", position: 0, isDueDate: false },
      { id: "field-why", templateId: "template-1", label: "Why?", type: "TEXT", position: 1, isDueDate: false },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([
      { id: "value-1", objectId: "object-1", templateFieldId: "field-why", label: "", type: "TEXT", value: "Cheaper than renting", position: 0, links: [] },
    ]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateId).toBe("template-1");
    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-date", label: "Date", type: "DATE", isDueDate: false, isRecurringDueDate: false, recurrence: null, value: "", targetObjectIds: [] },
      { templateFieldId: "field-why", label: "Why?", type: "TEXT", isDueDate: false, isRecurringDueDate: false, recurrence: null, value: "Cheaper than renting", targetObjectIds: [] },
    ]);
  });

  it("carries a Kinesis Link template field's targets through", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house", dueDate: null,
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-links", templateId: "template-1", label: "Kinesis Links", type: "KINESIS_LINK", position: 0, isDueDate: false },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);
    mocks.prisma.objectRelationship.findMany.mockResolvedValue([
      { sourceObjectId: "object-1", targetObjectId: "goal-object-1", templateFieldId: "field-links" },
    ]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-links", label: "Kinesis Links", type: "KINESIS_LINK", isDueDate: false, isRecurringDueDate: false, recurrence: null, value: "", targetObjectIds: ["goal-object-1"] },
    ]);
  });

  it("returns no template fields for an item that doesn't follow a template", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Loose item", dueDate: null,
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
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Buy a house", dueDate: null,
      module: { id: "module-1", name: "Decisions" },
      object: { templateId: "template-1", fields: [{ id: "extra-1", objectId: "object-1", templateFieldId: null, label: "Warranty", type: "TEXT", value: "2 years", position: 0, links: [] }] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.fields).toEqual([expect.objectContaining({ id: "extra-1", label: "Warranty", value: "2 years" })]);
  });

  /**
   * KD-038: a Due Date field's value is never in ObjectField -- it's the
   * object's own CustomItem.dueDate, the same column the fixed Due Date
   * input reads and writes.
   */
  it("reads a Due Date field's value from the item's own dueDate, not ObjectField", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Renew passport", dueDate: new Date("2027-03-09T00:00:00.000Z"),
      module: { id: "module-1", name: "Renewals" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-due", templateId: "template-1", label: "Due date", type: "DATE", position: 0, isDueDate: true },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-due", label: "Due date", type: "DATE", isDueDate: true, recurrence: null, value: "2027-03-09", targetObjectIds: [] },
    ]);
    // Never consulted for the due-date field's own value -- only for extras.
    expect(mocks.prisma.objectField.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { objectId: "object-1", templateFieldId: { not: null } } }));
  });

  /** KD-055: a Recurring Due Date field reads the same dueDate column, plus the item's stored repeat rule. */
  it("reads a Recurring Due Date field's date and rule from the item itself", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Service the car", dueDate: new Date("2026-10-20T00:00:00.000Z"),
      recurrence: "MONTHLY", recurrenceDays: null, recurrenceAnchorDay: 20,
      module: { id: "module-1", name: "Car Service" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-next", templateId: "template-1", label: "Next service due", type: "DATE", position: 0, isDueDate: false, isRecurringDueDate: true },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateFields).toEqual([
      { templateFieldId: "field-next", label: "Next service due", type: "DATE", isDueDate: false, isRecurringDueDate: true, recurrence: { rule: "MONTHLY", days: null, anchorDay: 20 }, value: "2026-10-20", targetObjectIds: [] },
    ]);
  });

  it("renders an unset Due Date field as empty, not the epoch", async () => {
    mocks.prisma.customItem.findFirst.mockResolvedValue({
      id: "item-1", objectId: "object-1", moduleId: "module-1", name: "Renew passport", dueDate: null,
      module: { id: "module-1", name: "Renewals" },
      object: { templateId: "template-1", fields: [] },
    });
    mocks.prisma.templateField.findMany.mockResolvedValue([
      { id: "field-due", templateId: "template-1", label: "Due date", type: "DATE", position: 0, isDueDate: true },
    ]);
    mocks.prisma.objectField.findMany.mockResolvedValue([]);

    const item = await getCustomItem("module-1", "item-1");

    expect(item?.templateFields[0].value).toBe("");
  });
});
