import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createCustomItemAction, updateCustomItemAction } from "@/app/(app)/custom-modules/actions";
import { getCustomItem } from "@/lib/data/custom-modules";
import { TEMPLATE_FIELD_VALUES_FORM_KEY } from "@/lib/templates/parse";

/**
 * The bug this exists to catch: saveTemplateFieldValues built the same
 * `links` payload for a brand-new ObjectField and an existing one, but
 * `deleteMany` is only valid against a row that already exists -- Prisma
 * rejects it inside a nested `create`. A mocked-Prisma unit test accepted
 * the call happily; the real client didn't, and the first time this path
 * actually ran (KD-039 wiring a Kinesis Link template field into item
 * creation) the create form crashed outright. These run every shape of
 * that write -- new, updated, cleared -- against a real database.
 */

const owner = "template-values-owner";

const form = (values: Record<string, string>, templateValues?: Array<Record<string, unknown>>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (templateValues) data.set(TEMPLATE_FIELD_VALUES_FORM_KEY, JSON.stringify(templateValues));
  return data;
};

async function makeTemplatedModule() {
  await prisma.template.create({
    data: {
      id: "template-1", userId: owner, name: "Reading log",
      fields: { create: [
        { id: "field-notes", label: "Notes", type: "TEXT", position: 0 },
        { id: "field-related", label: "Related goal", type: "KINESIS_LINK", position: 1 },
      ] },
    },
  });
  return prisma.customModule.create({ data: { id: "module-1", userId: owner, name: "Books", normalizedName: "books", icon: "star", color: "#111111", templateId: "template-1" } });
}

describe.sequential("a template's Kinesis Link field value", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Values", lastName: "Owner", email: "template-values-owner@example.test" } });
    await makeTemplatedModule();

    // Two objects the owner actually owns, to link to and to prove
    // ownership validation runs against the real database too.
    await prisma.object.create({ data: { id: "goal-object-1", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-object-1" } });
    await prisma.object.create({ data: { id: "goal-object-2", type: "GOAL", name: "Learn Spanish", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-2", name: "Learn Spanish", userId: owner, objectId: "goal-object-2" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("creates a brand-new field value with a link target -- the exact write that used to crash", async () => {
    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Atomic Habits" },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: ["goal-object-1"] }],
    ));

    expect(result.error).toBeUndefined();
    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Atomic Habits" }, select: { id: true } });
    const read = await getCustomItem("module-1", item.id);
    expect(read?.templateFields.find((f) => f.templateFieldId === "field-related")?.targetObjectIds).toEqual(["goal-object-1"]);
  });

  it("writes a plain TEXT field value alongside it in the same create", async () => {
    await createCustomItemAction("module-1", {}, form(
      { name: "Deep Work" },
      [
        { templateFieldId: "field-notes", value: "Recommended by a friend", targetObjectIds: [] },
        { templateFieldId: "field-related", value: "", targetObjectIds: ["goal-object-1"] },
      ],
    ));

    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Deep Work" }, select: { id: true } });
    const read = await getCustomItem("module-1", item.id);
    expect(read?.templateFields.find((f) => f.templateFieldId === "field-notes")?.value).toBe("Recommended by a friend");
  });

  it("adds and removes link targets on an existing value through the update path", async () => {
    await createCustomItemAction("module-1", {}, form(
      { name: "Sapiens" },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: ["goal-object-1"] }],
    ));
    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Sapiens" }, select: { id: true, updatedAt: true } });

    const result = await updateCustomItemAction("module-1", item.id, {}, form(
      { name: "Sapiens", updatedAt: item.updatedAt.toISOString() },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: ["goal-object-2"] }],
    ));

    expect(result.error).toBeUndefined();
    const read = await getCustomItem("module-1", item.id);
    expect(read?.templateFields.find((f) => f.templateFieldId === "field-related")?.targetObjectIds).toEqual(["goal-object-2"]);
  });

  it("deletes the row once a link value is cleared back to empty", async () => {
    await createCustomItemAction("module-1", {}, form(
      { name: "The Hobbit" },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: ["goal-object-1"] }],
    ));
    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "The Hobbit" }, select: { objectId: true, id: true, updatedAt: true } });

    await updateCustomItemAction("module-1", item.id, {}, form(
      { name: "The Hobbit", updatedAt: item.updatedAt.toISOString() },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: [] }],
    ));

    await expect(prisma.objectField.findFirst({ where: { objectId: item.objectId, templateFieldId: "field-related" } })).resolves.toBeNull();
  });

  it("refuses a link target the owner doesn't actually own", async () => {
    await prisma.user.create({ data: { id: "template-values-stranger", firstName: "S", lastName: "T", email: "stranger@example.test" } });
    await prisma.object.create({ data: { id: "stranger-object", type: "GOAL", name: "Not yours", userId: "template-values-stranger" } });

    const result = await createCustomItemAction("module-1", {}, form(
      { name: "Someone else's goal" },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: ["stranger-object"] }],
    ));

    expect(result).toEqual({ error: "One of the linked items no longer exists. Reopen the link field and choose again." });
    await expect(prisma.customItem.findFirst({ where: { name: "Someone else's goal" } })).resolves.toBeNull();
    await prisma.user.deleteMany({ where: { id: "template-values-stranger" } });
  });

  /**
   * The picker never offers an item as its own link target, but a stale tab
   * or a hand-built request still could -- this is the enforcement behind
   * that, checked here rather than a mock since it reads the item's own
   * `objectId` off the row the save is already writing.
   */
  it("refuses a template Kinesis Link field pointed at the item's own object, and writes nothing", async () => {
    await createCustomItemAction("module-1", {}, form({ name: "Sapiens" }, []));
    const item = await prisma.customItem.findFirstOrThrow({ where: { name: "Sapiens" }, select: { id: true, objectId: true, updatedAt: true } });

    const result = await updateCustomItemAction("module-1", item.id, {}, form(
      { name: "Sapiens", updatedAt: item.updatedAt.toISOString() },
      [{ templateFieldId: "field-related", value: "", targetObjectIds: [item.objectId] }],
    ));

    expect(result).toMatchObject({ error: "An item can't be linked to itself." });
    await expect(prisma.objectField.findFirst({ where: { objectId: item.objectId, templateFieldId: "field-related" } })).resolves.toBeNull();
  });
});
