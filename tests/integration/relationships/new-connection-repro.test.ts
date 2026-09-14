import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { saveRelationshipMap } from "@/app/(app)/relationships/actions";
import { getRelationshipMap } from "@/lib/data/relationships";
import type { RelationshipMapData } from "@/lib/relationships";

const owner = "new-connection-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

describe.sequential("repro: creating a brand-new relationship", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "New", lastName: "Owner", email: "new-connection-owner@example.test" } });
    const selfObject = await prisma.object.create({ data: { id: "nc-object-self", type: "PERSON", name: "Me", userId: owner } });
    await prisma.person.create({ data: { id: "nc-person-self", name: "Me", isSelf: true, userId: owner, objectId: selfObject.id, positionX: 488, positionY: 250, bubbleSize: 118 } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("connects self to a brand-new person in one save, exactly as the map's createConnection() would send it", async () => {
    const before = await getRelationshipMap();
    expect(before.people).toHaveLength(1);
    expect(before.relationships).toHaveLength(0);

    const newPersonId = "nc-person-new";
    const [firstPersonId, secondPersonId] = [before.people[0].id, newPersonId].sort();
    const payload: RelationshipMapData = {
      people: [
        ...before.people,
        { id: newPersonId, name: "New person", detail: "Relationship", x: 430, y: 340, size: 84, color: "#aa7866", icon: "user", selfRelationship: { practices: [], reflections: [], importantDates: [], notes: "" } },
      ],
      relationships: [
        { id: "nc-relationship-1", from: firstPersonId, to: secondPersonId, type: "Relationship", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
      ],
    };

    const result = await saveRelationshipMap(payload);
    expect(result.error).toBeUndefined();

    await expect(prisma.person.count({ where: { userId: owner } })).resolves.toBe(2);
    await expect(prisma.relationship.count({ where: { userId: owner } })).resolves.toBe(1);
    const saved = await prisma.relationship.findUniqueOrThrow({ where: { id: "nc-relationship-1" } });
    expect(saved.firstPersonId).toBe(firstPersonId);
    expect(saved.secondPersonId).toBe(secondPersonId);
  });

  it("connects two already-existing people with a brand-new relationship", async () => {
    const friendObject = await prisma.object.create({ data: { id: "nc-object-friend", type: "PERSON", name: "Sam", userId: owner } });
    await prisma.person.create({ data: { id: "nc-person-friend", name: "Sam", category: "Friend", userId: owner, objectId: friendObject.id, positionX: 300, positionY: 200, bubbleSize: 84 } });

    const before = await getRelationshipMap();
    expect(before.relationships).toHaveLength(0);
    const [firstPersonId, secondPersonId] = ["nc-person-self", "nc-person-friend"].sort();

    const result = await saveRelationshipMap({
      people: before.people,
      relationships: [{ id: "nc-relationship-2", from: firstPersonId, to: secondPersonId, type: "Friend", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" }],
    });

    expect(result.error).toBeUndefined();
    await expect(prisma.relationship.count({ where: { userId: owner } })).resolves.toBe(1);
  });
});
