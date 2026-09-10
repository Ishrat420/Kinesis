import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { searchGlobalIndex } from "@/lib/search/engine";

/**
 * Search used to read every linkable row on every page load and filter in
 * JavaScript -- correct by construction, since nothing was ever excluded
 * before the ranker saw it. Moving the filter into hand-written SQL per
 * provider (lib/search/providers.ts) is exactly the kind of change that can
 * silently drop a real result: a wrong column name or a missing nested-table
 * condition doesn't fail loudly, it just makes something unfindable. These
 * run the real queries against a real database, one per provider's own
 * searchable surface, plus the accent-folding and cross-user scoping the
 * SQL rewrite specifically has to get right that a mocked Prisma client
 * never could have caught.
 */

const owner = "search-owner";
const stranger = "search-stranger";

async function seedOwner(userId: string, tag: string) {
  await prisma.user.create({ data: { id: userId, firstName: "Search", lastName: "Owner", email: `${tag}@example.test` } });
}

describe.sequential("global search", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Search", lastName: "Owner", preferredName: null });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await seedOwner(owner, "owner");
    await seedOwner(stranger, "stranger");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("returns nothing for an empty query without touching any provider", async () => {
    await expect(searchGlobalIndex("")).resolves.toEqual([]);
    await expect(searchGlobalIndex("   ")).resolves.toEqual([]);
  });

  it("finds a document by name, by a custom field's value, and accent-insensitively", async () => {
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passeport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passeport", type: "Identity", status: "Active", owner: "Owner", userId: owner, objectId: "doc-obj" } });
    await prisma.objectField.create({ data: { id: "doc-field", objectId: "doc-obj", label: "Country", value: "Réunion" } });

    await expect(searchGlobalIndex("passeport")).resolves.toEqual([expect.objectContaining({ id: "document:doc-1" })]);
    await expect(searchGlobalIndex("PASSEPORT")).resolves.toEqual([expect.objectContaining({ id: "document:doc-1" })]);
    await expect(searchGlobalIndex("passeport")).resolves.toEqual(await searchGlobalIndex("pAsseport")); // case-insensitive, consistent either way
    await expect(searchGlobalIndex("reunion")).resolves.toEqual([expect.objectContaining({ id: "document:doc-1" })]);
  });

  it("finds a goal by a milestone's name, not just the goal's own fields", async () => {
    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Fitness", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Fitness", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Run a marathon" } });

    await expect(searchGlobalIndex("marathon")).resolves.toEqual([expect.objectContaining({ id: "goal:goal-1" })]);
  });

  it("finds a finance item by its numeric amount", async () => {
    await prisma.object.create({ data: { id: "finance-obj", type: "FINANCE_ITEM", name: "Rent", userId: owner } });
    await prisma.financeItem.create({ data: { id: "finance-1", kind: "expense", name: "Rent", amount: 2450, userId: owner, objectId: "finance-obj" } });

    await expect(searchGlobalIndex("2450")).resolves.toEqual([expect.objectContaining({ id: "finance:finance-1" })]);
  });

  it("finds a connection by either person's name and by a shared practice's title", async () => {
    await prisma.object.create({ data: { id: "self-obj", type: "PERSON", name: "Me", userId: owner } });
    await prisma.person.create({ data: { id: "self-1", name: "Me", isSelf: true, userId: owner, objectId: "self-obj" } });
    await prisma.object.create({ data: { id: "friend-obj", type: "PERSON", name: "Priya", userId: owner } });
    await prisma.person.create({ data: { id: "friend-1", name: "Priya", userId: owner, objectId: "friend-obj" } });
    await prisma.relationship.create({ data: { id: "rel-1", userId: owner, firstPersonId: "self-1", secondPersonId: "friend-1" } });
    await prisma.connectionPractice.create({ data: { id: "practice-1", relationshipId: "rel-1", title: "Sunday call", position: 0 } });

    // "Priya" alone legitimately matches both her own person entry and the
    // connection she's part of -- only "Sunday call" narrows to the connection.
    await expect(searchGlobalIndex("priya")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: "relationship:rel-1" }), expect.objectContaining({ id: "person:friend-1" })]));
    await expect(searchGlobalIndex("sunday call")).resolves.toEqual([expect.objectContaining({ id: "relationship:rel-1" })]);
  });

  it("shows a self person's preferred display name in results, not the raw stored name", async () => {
    mocks.requireKinesisUser.mockResolvedValue({ id: owner, firstName: "Search", lastName: "Owner", preferredName: "Sam" });
    await prisma.object.create({ data: { id: "self-obj", type: "PERSON", name: "Samuel", userId: owner } });
    await prisma.person.create({ data: { id: "self-1", name: "Samuel", isSelf: true, userId: owner, objectId: "self-obj" } });

    const results = await searchGlobalIndex("person");
    expect(results).toEqual([expect.objectContaining({ id: "person:self-1", title: "Sam" })]);
  });

  it("finds a custom item by its own name, by its module's name, and by a field value", async () => {
    await prisma.customModule.create({ data: { id: "module-1", name: "Recipes", normalizedName: "recipes", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Lasagna", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Lasagna", moduleId: "module-1", objectId: "item-obj" } });
    await prisma.objectField.create({ data: { id: "item-field", objectId: "item-obj", label: "Cuisine", value: "Italian" } });

    await expect(searchGlobalIndex("lasagna")).resolves.toEqual([expect.objectContaining({ id: "custom-item:item-1" })]);
    await expect(searchGlobalIndex("recipes")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: "custom-item:item-1" })]));
    await expect(searchGlobalIndex("italian")).resolves.toEqual([expect.objectContaining({ id: "custom-item:item-1" })]);
  });

  it("finds every to-do through the constant 'task' keyword, not just its name", async () => {
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", userId: owner, objectId: "todo-obj" } });

    await expect(searchGlobalIndex("task")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: "todo:todo-1" })]));
    await expect(searchGlobalIndex("renew")).resolves.toEqual([expect.objectContaining({ id: "todo:todo-1" })]);
  });

  it("never returns another account's rows, across every provider", async () => {
    await prisma.object.create({ data: { id: "s-doc-obj", type: "DOCUMENT", name: "Stranger passport", userId: stranger } });
    await prisma.document.create({ data: { id: "s-doc", name: "Stranger passport", type: "Identity", status: "Active", owner: "Owner", userId: stranger, objectId: "s-doc-obj" } });
    await prisma.object.create({ data: { id: "s-todo-obj", type: "TODO", name: "Stranger todo", userId: stranger } });
    await prisma.todo.create({ data: { id: "s-todo", name: "Stranger todo", userId: stranger, objectId: "s-todo-obj" } });

    await expect(searchGlobalIndex("stranger")).resolves.toEqual([]);
  });

  it("ranks a title match above a match found only through nested content", async () => {
    await prisma.object.create({ data: { id: "goal-obj-a", type: "GOAL", name: "Marathon training", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-a", name: "Marathon training", userId: owner, objectId: "goal-obj-a" } });
    await prisma.object.create({ data: { id: "goal-obj-b", type: "GOAL", name: "Reading list", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-b", name: "Reading list", userId: owner, objectId: "goal-obj-b" } });
    await prisma.milestone.create({ data: { id: "milestone-b", goalId: "goal-b", name: "Marathon novel" } });

    const results = await searchGlobalIndex("marathon");
    expect(results.map((entry) => entry.id)).toEqual(["goal:goal-a", "goal:goal-b"]);
  });
});
