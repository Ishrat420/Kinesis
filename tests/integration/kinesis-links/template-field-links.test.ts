import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/attention/dismissal", () => ({ parseDismissalKey: vi.fn() }));
vi.mock("@/lib/relationships/occurrence", () => ({ getNextOccurrence: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createCustomItemAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { createDocumentAction } from "@/app/(app)/documents/actions";
import { removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { getCustomItem } from "@/lib/data/custom-modules";
import { getKinesisLinks } from "@/lib/data/object-relationships";
import { getKinesisLinkPreviews } from "@/lib/data/kinesis-links";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { getTemplateFieldSample, updateTemplate } from "@/lib/data/templates";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";

/**
 * KD-023: a template's Kinesis Link field (e.g. the starter template's
 * "Related") and a link field picked while creating a record are stored as
 * Kinesis Links, so the record they point at shows them as backlinks.
 */

const owner = "template-links-owner";
const stranger = "template-links-stranger";

const form = (values: Record<string, string>, templateValues?: Array<Record<string, unknown>>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (templateValues) data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(templateValues));
  return data;
};

async function createItem(name: string, related: string[]) {
  const result = await createCustomItemAction("tl-module", {}, form({ name }, [{ templateFieldId: "tl-related", value: "", targetObjectIds: related }]));
  expect(result.error).toBeUndefined();
  return prisma.customItem.findFirstOrThrow({ where: { name }, select: { id: true, objectId: true, updatedAt: true } });
}

async function setRelated(item: { id: string }, name: string, related: string[]) {
  const { updatedAt } = await prisma.customItem.findUniqueOrThrow({ where: { id: item.id }, select: { updatedAt: true } });
  const result = await updateCustomItemAction("tl-module", item.id, {}, form({ name, updatedAt: updatedAt.toISOString() }, [{ templateFieldId: "tl-related", value: "", targetObjectIds: related }]));
  expect(result.error).toBeUndefined();
}

const relatedOf = async (itemId: string) => (await getCustomItem("tl-module", itemId))?.templateFields.find((field) => field.templateFieldId === "tl-related")?.targetObjectIds;

describe.sequential("Kinesis Link fields stored as Kinesis Links (KD-023)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Link", lastName: "Owner", preferredName: null });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({ data: [
      { id: owner, firstName: "Link", lastName: "Owner", email: "template-links-owner@example.test" },
      { id: stranger, firstName: "Some", lastName: "Stranger", email: "template-links-stranger@example.test" },
    ] });
    await prisma.template.create({ data: { id: "tl-template", userId: owner, name: "General Record", fields: { create: [
      { id: "tl-notes", label: "Notes", type: "TEXT", position: 0 },
      { id: "tl-related", label: "Related", type: "KINESIS_LINK", position: 1 },
    ] } } });
    await prisma.customModule.create({ data: { id: "tl-module", userId: owner, name: "Home", normalizedName: "home", icon: "star", color: "#111111", templateId: "tl-template" } });
    for (const [id, name] of [["tl-goal-1", "Buy a house"], ["tl-goal-2", "Save a deposit"]]) {
      await prisma.object.create({ data: { id: `${id}-object`, type: "GOAL", name, userId: owner } });
      await prisma.goal.create({ data: { id, name, userId: owner, objectId: `${id}-object` } });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("stores a template field's targets as Kinesis Links tied to the field, in the order they were picked", async () => {
    const item = await createItem("Mortgage", ["tl-goal-2-object", "tl-goal-1-object"]);

    await expect(prisma.objectField.count({ where: { objectId: item.objectId, type: "KINESIS_LINK" } })).resolves.toBe(0);
    await expect(prisma.objectRelationship.findMany({ where: { sourceObjectId: item.objectId }, orderBy: { createdAt: "asc" } })).resolves.toMatchObject([
      { targetObjectId: "tl-goal-2-object", type: "CUSTOM", customLabel: "Related", templateFieldId: "tl-related" },
      { targetObjectId: "tl-goal-1-object", type: "CUSTOM", customLabel: "Related", templateFieldId: "tl-related" },
    ]);
    await expect(relatedOf(item.id)).resolves.toEqual(["tl-goal-2-object", "tl-goal-1-object"]);
  });

  it("shows the link on the record it points at, and not twice on the item's own page", async () => {
    const item = await createItem("Mortgage", ["tl-goal-1-object"]);

    await expect(getKinesisLinks("tl-goal-1-object")).resolves.toMatchObject([
      { label: "Related", inverse: true, fromTemplateField: true, target: { objectId: item.objectId, name: "Mortgage" } },
    ]);
    // On the item's own page the link is shown inside its "Related" field.
    await expect(getKinesisLinks(item.objectId)).resolves.toEqual([]);
  });

  it("adds and removes only what changed, recording each in both records' History", async () => {
    const item = await createItem("Mortgage", ["tl-goal-1-object"]);
    const firstLink = await prisma.objectRelationship.findFirstOrThrow({ where: { sourceObjectId: item.objectId } });

    await setRelated(item, "Mortgage", ["tl-goal-1-object", "tl-goal-2-object"]);
    await setRelated(item, "Mortgage", ["tl-goal-2-object"]);

    await expect(relatedOf(item.id)).resolves.toEqual(["tl-goal-2-object"]);
    await expect(prisma.objectRelationship.findUnique({ where: { id: firstLink.id } })).resolves.toBeNull();
    const eventsOn = async (objectId: string) => (await prisma.objectEvent.findMany({ where: { objectId, eventType: { in: ["RELATIONSHIP_ADDED", "RELATIONSHIP_REMOVED"] } }, orderBy: { occurredAt: "asc" } })).map((event) => event.eventType);
    expect(await eventsOn("tl-goal-1-object")).toEqual(["RELATIONSHIP_ADDED", "RELATIONSHIP_REMOVED"]);
    expect(await eventsOn(item.objectId)).toEqual(["RELATIONSHIP_ADDED", "RELATIONSHIP_ADDED", "RELATIONSHIP_REMOVED"]);
    // ...and they read as History lines on the linked record.
    expect((await getObjectEvents("tl-goal-1-object")).length).toBeGreaterThanOrEqual(2);
  });

  it("lets two items' Related fields point at each other", async () => {
    const first = await createItem("Mortgage", []);
    const second = await createItem("Deposit account", [first.objectId]);
    await setRelated(first, "Mortgage", [second.objectId]);

    await expect(relatedOf(first.id)).resolves.toEqual([second.objectId]);
    await expect(relatedOf(second.id)).resolves.toEqual([first.objectId]);
  });

  it("relabels a field's links everywhere when the template field is renamed", async () => {
    const item = await createItem("Mortgage", ["tl-goal-1-object"]);
    const template = await prisma.template.findUniqueOrThrow({ where: { id: "tl-template" } });

    await updateTemplate("tl-template", "General Record", [
      { id: "tl-notes", label: "Notes", type: "TEXT" },
      { id: "tl-related", label: "Linked to", type: "KINESIS_LINK" },
    ], template.updatedAt);

    await expect(getKinesisLinks("tl-goal-1-object")).resolves.toMatchObject([{ label: "Linked to", target: { objectId: item.objectId } }]);
  });

  it("can be removed from the linked record's side, but not retyped", async () => {
    const item = await createItem("Mortgage", ["tl-goal-1-object"]);
    const [link] = await getKinesisLinks("tl-goal-1-object");

    const retype = new FormData();
    retype.set("direction", "BLOCKS|forward");
    await updateKinesisLinkAction("tl-goal-1-object", link.id, retype);
    await expect(prisma.objectRelationship.findUniqueOrThrow({ where: { id: link.id } })).resolves.toMatchObject({ type: "CUSTOM", templateFieldId: "tl-related" });

    await removeKinesisLinkAction("tl-goal-1-object", link.id);
    await expect(relatedOf(item.id)).resolves.toEqual([]);
  });

  it("counts a field's links for card previews and the template's sample", async () => {
    const item = await createItem("Mortgage", ["tl-goal-1-object", "tl-goal-2-object"]);
    await prisma.template.update({ where: { id: "tl-template" }, data: { previewFields: ["tl-related"] } });

    const previews = await getKinesisLinkPreviews([item.objectId]);
    expect(JSON.stringify(previews[item.objectId])).toContain("2");
    await expect(getTemplateFieldSample("tl-template")).resolves.toMatchObject({ values: { "tl-related": { linkCount: 2 } } });
  });

  it("refuses a target the owner doesn't own, writing nothing", async () => {
    await prisma.object.create({ data: { id: "tl-stranger-object", type: "GOAL", name: "Not yours", userId: stranger } });

    const result = await createCustomItemAction("tl-module", {}, form({ name: "Sneaky" }, [{ templateFieldId: "tl-related", value: "", targetObjectIds: ["tl-stranger-object"] }]));

    expect(result.error).toBeTruthy();
    await expect(prisma.objectRelationship.count({ where: { targetObjectId: "tl-stranger-object" } })).resolves.toBe(0);
  });

  it("saves a link field picked while creating a document as Kinesis Links the document shows", async () => {
    const data = form({ name: "Passport", type: "Passport" });
    data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ label: "For", type: "KINESIS_LINK", value: "", targetObjectIds: ["tl-goal-1-object"] }]));

    await createDocumentAction({}, data);

    const document = await prisma.document.findFirstOrThrow({ where: { userId: owner, name: "Passport" } });
    await expect(prisma.objectField.count({ where: { objectId: document.objectId } })).resolves.toBe(0);
    await expect(getKinesisLinks(document.objectId)).resolves.toMatchObject([{ label: "For", target: { objectId: "tl-goal-1-object" } }]);
    await expect(getKinesisLinks("tl-goal-1-object")).resolves.toMatchObject([{ label: "For", target: { objectId: document.objectId } }]);
  });
});

/**
 * The data half of 20261021000000_template_kinesis_links, run against
 * old-style rows: the same SQL production runs on deploy, from step 3 on
 * (steps 1-2 are the schema change, already applied to this database).
 */
describe.sequential("migrating old-style Kinesis Link fields", () => {
  const migration = readFileSync("prisma/migrations/20261021000000_template_kinesis_links/migration.sql", "utf8");
  const dataSteps = migration.slice(migration.indexOf("-- 3."))
    .split(/;\s*\n/)
    .map((statement) => statement.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({ data: [
      { id: owner, firstName: "Link", lastName: "Owner", email: "template-links-owner@example.test" },
      { id: stranger, firstName: "Some", lastName: "Stranger", email: "template-links-stranger@example.test" },
    ] });
    await prisma.template.create({ data: { id: "tl-template", userId: owner, name: "General Record", fields: { create: [{ id: "tl-related", label: "Related", type: "KINESIS_LINK", position: 0 }] } } });
    await prisma.object.createMany({ data: [
      { id: "m-item-a", type: "CUSTOM_ITEM", name: "Item A", userId: owner, templateId: "tl-template" },
      { id: "m-item-b", type: "CUSTOM_ITEM", name: "Item B", userId: owner, templateId: "tl-template" },
      { id: "m-goal", type: "GOAL", name: "Goal", userId: owner },
      { id: "m-doc", type: "DOCUMENT", name: "Doc", userId: owner },
      { id: "m-foreign", type: "GOAL", name: "Foreign", userId: stranger },
    ] });
    // Item A's "Related": goal then doc (position order), and itself. (A
    // cross-account target can't exist: a trigger already refuses that
    // FieldLink. The migration filters it anyway, as a backstop.)
    await prisma.objectField.create({ data: { id: "m-a-related", objectId: "m-item-a", templateFieldId: "tl-related", label: "", type: "KINESIS_LINK", value: "", links: { create: [
      { id: "m-a-1", targetObjectId: "m-doc", position: 1 },
      { id: "m-a-0", targetObjectId: "m-goal", position: 0 },
      { id: "m-a-self", targetObjectId: "m-item-a", position: 2 },
    ] } } });
    // Item B's "Related" points back at item A -- the same pair, the other way.
    await prisma.objectField.create({ data: { id: "m-b-related", objectId: "m-item-b", templateFieldId: "tl-related", label: "", type: "KINESIS_LINK", value: "", links: { create: [{ id: "m-b-0", targetObjectId: "m-item-a", position: 0 }] } } });
    // An ad-hoc link field from a create form, plus a non-link field that must survive.
    await prisma.objectField.create({ data: { id: "m-doc-adhoc", objectId: "m-doc", label: "For", type: "KINESIS_LINK", value: "", links: { create: [{ id: "m-doc-0", targetObjectId: "m-goal", position: 0 }] } } });
    await prisma.objectField.create({ data: { id: "m-doc-text", objectId: "m-doc", label: "Note", type: "TEXT", value: "keep me" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
  });

  it("converts every link field value into Kinesis Links, in order, skipping self-links", async () => {
    for (const statement of dataSteps) await prisma.$executeRawUnsafe(statement);

    const links = await prisma.objectRelationship.findMany({ where: { userId: owner }, orderBy: [{ sourceObjectId: "asc" }, { createdAt: "asc" }] });
    expect(links.map(({ sourceObjectId, targetObjectId, customLabel, templateFieldId }) => ({ sourceObjectId, targetObjectId, customLabel, templateFieldId }))).toEqual([
      { sourceObjectId: "m-doc", targetObjectId: "m-goal", customLabel: "For", templateFieldId: null },
      { sourceObjectId: "m-item-a", targetObjectId: "m-goal", customLabel: "Related", templateFieldId: "tl-related" },
      { sourceObjectId: "m-item-a", targetObjectId: "m-doc", customLabel: "Related", templateFieldId: "tl-related" },
      { sourceObjectId: "m-item-b", targetObjectId: "m-item-a", customLabel: "Related", templateFieldId: "tl-related" },
    ]);
    await expect(prisma.objectField.findMany({ select: { id: true }, where: { object: { userId: owner } } })).resolves.toEqual([{ id: "m-doc-text" }]);
    await expect(prisma.fieldLink.count({ where: { field: { object: { userId: owner } } } })).resolves.toBe(0);
  });

  it("is safe to run twice", async () => {
    for (const statement of dataSteps) await prisma.$executeRawUnsafe(statement);
    for (const statement of dataSteps) await prisma.$executeRawUnsafe(statement);

    await expect(prisma.objectRelationship.count({ where: { userId: owner } })).resolves.toBe(4);
  });
});
