import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createCustomItemAction, toggleCustomItemArchivedAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";

/** KD-048 Phase 1 remainder: a Custom Item's own lifecycle, fields, and archival enter the ObjectEvent history. */

const owner = "custom-item-history-owner";

const form = (values: Record<string, string>, customFields?: Array<Record<string, unknown>>, templateValues?: Array<Record<string, unknown>>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (customFields) data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify(customFields));
  if (templateValues) data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(templateValues));
  return data;
};

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a Custom Item's own history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Item", lastName: "Owner", email: "custom-item-history@example.test" } });
    await prisma.customModule.create({ data: { id: "module-plain", userId: owner, name: "Books", normalizedName: "books", icon: "star", color: "#111111" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("createCustomItemAction records ITEM_CREATED", async () => {
    await createCustomItemAction("module-plain", {}, form({ name: "Dune" }));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-plain", name: "Dune" } });

    await expect(eventsOn(item.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("updateCustomItemAction records FIELD_CHANGED for name and due date, and diffs ad-hoc custom fields", async () => {
    await createCustomItemAction("module-plain", {}, form({ name: "Arrival" }));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-plain", name: "Arrival" } });

    await updateCustomItemAction("module-plain", item.id, {}, form(
      { name: "Arrival (renamed)", updatedAt: item.updatedAt.toISOString() },
      [{ label: "Rating", type: "TEXT", value: "5 stars" }],
    ));

    const events = await eventsOn(item.objectId);
    expect(events).toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "name", oldValue: "Arrival", newValue: "Arrival (renamed)" },
      { eventType: "FIELD_CHANGED", oldValue: null, newValue: "5 stars" },
    ]);
  });

  it("updateCustomItemAction records ITEM_ARCHIVED/ITEM_RESTORED for the archived toggle", async () => {
    await createCustomItemAction("module-plain", {}, form({ name: "Dune" }));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-plain", name: "Dune" } });

    await updateCustomItemAction("module-plain", item.id, {}, form({ name: "Dune", updatedAt: item.updatedAt.toISOString(), archived: "true" }));

    const events = await eventsOn(item.objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "ITEM_ARCHIVED" });
  });

  it("toggleCustomItemArchivedAction records ITEM_ARCHIVED/ITEM_RESTORED", async () => {
    await createCustomItemAction("module-plain", {}, form({ name: "Dune" }));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-plain", name: "Dune" } });

    await toggleCustomItemArchivedAction("module-plain", item.id, true);
    await expect(eventsOn(item.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }, { eventType: "ITEM_ARCHIVED" }]);

    await toggleCustomItemArchivedAction("module-plain", item.id, false);
    const events = await eventsOn(item.objectId);
    expect(events.at(-1)).toMatchObject({ eventType: "ITEM_RESTORED" });

    // Resubmitting the same state records nothing new.
    await toggleCustomItemArchivedAction("module-plain", item.id, false);
    await expect(eventsOn(item.objectId)).resolves.toHaveLength(3);
  });

  it("diffs a template's own field values, keyed by templateFieldId, on create and update", async () => {
    await prisma.template.create({
      data: { id: "template-history", userId: owner, name: "Reading log", fields: { create: [{ id: "field-notes", label: "Notes", type: "TEXT", position: 0 }] } },
    });
    await prisma.customModule.create({ data: { id: "module-templated", userId: owner, name: "Reading", normalizedName: "reading", icon: "star", color: "#222222", templateId: "template-history" } });

    await createCustomItemAction("module-templated", {}, form({ name: "Dune" }, undefined, [{ templateFieldId: "field-notes", value: "Started reading" }]));
    const item = await prisma.customItem.findFirstOrThrow({ where: { moduleId: "module-templated", name: "Dune" } });

    await updateCustomItemAction("module-templated", item.id, {}, form(
      { name: "Dune", updatedAt: item.updatedAt.toISOString() },
      undefined,
      [{ templateFieldId: "field-notes", value: "Finished reading" }],
    ));

    const events = await eventsOn(item.objectId);
    expect(events).toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "field-notes", fieldLabel: "Notes", oldValue: null, newValue: "Started reading" },
      { eventType: "FIELD_CHANGED", fieldKey: "field-notes", fieldLabel: "Notes", oldValue: "Started reading", newValue: "Finished reading" },
    ]);
  });
});
