import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { saveRelationshipMap } from "@/app/(app)/relationships/actions";
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
  selfRelationship: { practices: [], reflections: [], importantDates: [], notes: "" },
  ...overrides,
});

const soloMap = (people: RelationshipPerson[]): RelationshipMapData => ({ people, relationships: [] });

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

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
    await saveRelationshipMap(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await expect(eventsOn(created.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("records FIELD_CHANGED only for the fields that actually changed", async () => {
    await saveRelationshipMap(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await saveRelationshipMap(soloMap([person("friend-one", { name: "Samantha", detail: "Colleague" })]));

    const events = await eventsOn(created.objectId);
    expect(events).toMatchObject([
      { eventType: "ITEM_CREATED" },
      { eventType: "FIELD_CHANGED", fieldKey: "name", oldValue: "Sam", newValue: "Samantha" },
      { eventType: "FIELD_CHANGED", fieldKey: "category", oldValue: "Friend", newValue: "Colleague" },
    ]);
  });

  it("records nothing when a person is resubmitted unchanged", async () => {
    await saveRelationshipMap(soloMap([person("friend-one", { name: "Sam" })]));
    const created = await prisma.person.findFirstOrThrow({ where: { userId: owner, name: "Sam" } });

    await saveRelationshipMap(soloMap([person("friend-one", { name: "Sam" })]));

    await expect(eventsOn(created.objectId)).resolves.toHaveLength(1); // just the original ITEM_CREATED
  });

  it("never records history for the owner's own self bubble", async () => {
    await saveRelationshipMap(soloMap([person("self", { name: "Me", detail: "You" })]));
    const self = await prisma.person.findFirstOrThrow({ where: { userId: owner, isSelf: true } });

    await saveRelationshipMap(soloMap([person("self", { name: "My name", detail: "You" })]));

    await expect(eventsOn(self.objectId)).resolves.toEqual([]);
  });
});
