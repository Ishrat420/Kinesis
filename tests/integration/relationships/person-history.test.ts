import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getPersonHistoryAction, saveRelationshipMap } from "@/app/(app)/relationships/actions";
import { getRelationshipMap } from "@/lib/data/relationships";
import type { RelationshipMapData, RelationshipPerson } from "@/lib/relationships";

/**
 * A Person's own add/edit enters the ObjectEvent history (KD-048) -- ported
 * here onto the same real per-field facts every other module already gets,
 * now that ActivityEvent (Relationships' only previous tracking, a bare
 * "Added"/"Updated" sentence) is retired.
 */

const owner = "person-history-owner";

const person = (id: string, overrides: Partial<RelationshipPerson> = {}): RelationshipPerson => ({
  id, name: id, detail: "Friend", x: 10, y: 20, size: 84, color: "#292524", icon: "user",
  selfRelationship: { practices: [], reflections: [], importantDates: [], notes: "" }, objectId: null,
  ...overrides,
});

const soloMap = (people: RelationshipPerson[]): RelationshipMapData => ({ people, relationships: [] });

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

/** Fetches the map's real, current version immediately before saving, the same way a freshly-loaded map would (BUG-007) -- so none of these incidentally becomes a conflict test. */
const save = async (data: RelationshipMapData) => saveRelationshipMap(data, (await getRelationshipMap()).version);

describe.sequential("a Person's own history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Person", lastName: "Owner", email: "person-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("records ITEM_CREATED for a new person", async () => {
    await save(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await expect(eventsOn(created.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("records FIELD_CHANGED only for the fields that actually changed", async () => {
    await save(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await save(soloMap([person("friend-one", { name: "Samantha", detail: "Colleague" })]));

    const events = await eventsOn(created.objectId);
    expect(events).toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "name", oldValue: "Sam", newValue: "Samantha" },
      { eventType: "FIELD_CHANGED", fieldKey: "category", oldValue: "Friend", newValue: "Colleague" },
    ]);
  });

  it("records nothing when a person is resubmitted unchanged", async () => {
    await save(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await save(soloMap([person("friend-one", { name: "Sam" })]));

    await expect(eventsOn(created.objectId)).resolves.toHaveLength(1); // just the original ITEM_CREATED
  });

  it("never records history for the owner's own self bubble", async () => {
    await save(soloMap([person("self", { name: "Me", detail: "You" })]));
    const self = await prisma.person.findFirstOrThrow({ where: { userId: owner, isSelf: true } });

    await save(soloMap([person("self", { name: "My name", detail: "You" })]));

    await expect(eventsOn(self.objectId)).resolves.toEqual([]);
  });
});

/**
 * `getPersonHistoryAction` -- the read side `HistoryCard.tsx` calls on
 * demand from the map's client component, rather than the page pre-loading
 * every person's history the way every other object's own detail page does
 * (KD-048's usual pattern, impractical here since one page holds every
 * person at once).
 */
describe.sequential("getPersonHistoryAction (KD-048)", () => {
  const stranger = "person-history-stranger";

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Person", lastName: "Owner", email: "person-history@example.test" },
        { id: stranger, firstName: "Some", lastName: "Stranger", email: "person-history-stranger@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("returns the same title/detail pairs the person's own History section would show", async () => {
    await save(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });
    await save(soloMap([person("friend-one", { name: "Samantha" })]));

    const entries = await getPersonHistoryAction(created.objectId);

    expect(entries).toMatchObject([
      { title: "Name changed", detail: "From Sam · To Samantha" },
      { title: "Created" },
    ]);
    expect(entries.every((entry) => typeof entry.occurredAt === "string")).toBe(true);
  });

  it("returns nothing for another account's person, even with the right objectId", async () => {
    mocks.requireKinesisUser.mockResolvedValue({ id: stranger });
    await save(soloMap([person("their-friend", { name: "Theirs" })]));
    const theirs = await prisma.person.findFirstOrThrow({ where: { userId: stranger, name: "Theirs" } });

    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await expect(getPersonHistoryAction(theirs.objectId)).resolves.toEqual([]);
  });

  it("returns nothing for a person that doesn't exist", async () => {
    await expect(getPersonHistoryAction("not-a-real-object-id")).resolves.toEqual([]);
  });
});
