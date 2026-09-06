import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { saveMapGeometry, saveRelationshipMap } from "@/app/(app)/relationships/actions";
import { getRelationshipMap } from "@/lib/data/relationships";
import type { RelationshipMapData } from "@/lib/relationships";

/**
 * Saving the map used to delete every person and connection the account had and
 * rebuild the lot from the browser's copy. Everything below is a consequence of
 * that: child rows got fresh ids, so a practice lost the `createdAt` its
 * schedule was derived from and an important date took its notification -- read
 * state and all -- to the grave on every single save.
 *
 * These run against the real database because that is where the damage was: the
 * foreign keys, the cascades and the identity layer are the whole mechanism.
 */

const owner = "map-owner";

const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

async function seedMap() {
  const selfObject = await prisma.object.create({ data: { id: "object-self", type: "PERSON", name: "Me", userId: owner } });
  const friendObject = await prisma.object.create({ data: { id: "object-friend", type: "PERSON", name: "Sam", userId: owner } });
  await prisma.person.create({ data: { id: "person-self", name: "Me", isSelf: true, userId: owner, objectId: selfObject.id, positionX: 100, positionY: 100, bubbleSize: 118 } });
  await prisma.person.create({ data: { id: "person-friend", name: "Sam", category: "Friend", userId: owner, objectId: friendObject.id, positionX: 300, positionY: 200, bubbleSize: 84 } });
  await prisma.relationship.create({ data: { id: "relationship-1", userId: owner, firstPersonId: "person-self", secondPersonId: "person-friend", type: "Friend" } });
  await prisma.connectionPractice.create({ data: { id: "practice-1", relationshipId: "relationship-1", title: "Sunday walk", cadence: "Weekly", anchorDate: new Date("2026-01-04T00:00:00.000Z"), position: 0 } });
  await prisma.relationshipImportantDate.create({ data: { id: "date-1", relationshipId: "relationship-1", label: "Birthday", date: new Date("2026-03-09T00:00:00.000Z"), repeatsYearly: true } });
  await prisma.relationshipReflection.create({ data: { id: "reflection-1", relationshipId: "relationship-1", text: "Good year.", reflectedAt: new Date("2026-02-01T00:00:00.000Z") } });
  // A read reminder, hanging off the important date by foreign key.
  await prisma.notification.create({ data: {
    id: "notification-1", userId: owner, relationshipDateId: "date-1", type: "REMINDER_DUE",
    documentName: "Sam's Birthday", message: "Sam's Birthday is in 30 days", actionUrl: "/relationships",
    expiryDate: new Date("2026-03-09T00:00:00.000Z"), readAt: new Date("2026-02-07T00:00:00.000Z"),
  } });
}

describe.sequential("relationship map reconciliation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Map", lastName: "Owner", email: "map-owner@example.test" } });
    await seedMap();
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  const rename = (map: RelationshipMapData, name: string): RelationshipMapData => ({
    ...map,
    people: map.people.map((person) => person.id === "person-friend" ? { ...person, name } : person),
  });

  it("keeps every child row's identity across an unrelated edit", async () => {
    const before = await getRelationshipMap();
    const result = await saveRelationshipMap(rename(before, "Samantha"));
    expect(result.error).toBeUndefined();

    // Same rows, not replacements wearing the same values.
    await expect(prisma.connectionPractice.findMany({ select: { id: true, anchorDate: true } })).resolves.toEqual([
      { id: "practice-1", anchorDate: new Date("2026-01-04T00:00:00.000Z") },
    ]);
    await expect(prisma.relationshipImportantDate.findMany({ select: { id: true } })).resolves.toEqual([{ id: "date-1" }]);
    await expect(prisma.relationshipReflection.findMany({ select: { id: true } })).resolves.toEqual([{ id: "reflection-1" }]);
    await expect(prisma.person.findUniqueOrThrow({ where: { id: "person-friend" } })).resolves.toMatchObject({ name: "Samantha" });
  });

  /** The bug that made the calendar's recurring practices wander. */
  it("does not move a practice's anchor when the map is saved", async () => {
    const before = await prisma.connectionPractice.findUniqueOrThrow({ where: { id: "practice-1" } });
    await saveRelationshipMap(rename(await getRelationshipMap(), "Samantha"));
    const after = await prisma.connectionPractice.findUniqueOrThrow({ where: { id: "practice-1" } });
    expect(after.anchorDate).toEqual(before.anchorDate);
    expect(after.createdAt).toEqual(before.createdAt);
  });

  /** The bug that handed back a bell full of reminders already dismissed. */
  it("leaves an important date's notification, and its read state, intact", async () => {
    await saveRelationshipMap(rename(await getRelationshipMap(), "Samantha"));
    await expect(prisma.notification.findUniqueOrThrow({ where: { id: "notification-1" } })).resolves.toMatchObject({
      relationshipDateId: "date-1",
      readAt: new Date("2026-02-07T00:00:00.000Z"),
    });
  });

  it("renames the person's shared identity along with the person", async () => {
    await saveRelationshipMap(rename(await getRelationshipMap(), "Samantha"));
    await expect(prisma.object.findUniqueOrThrow({ where: { id: "object-friend" } })).resolves.toMatchObject({ name: "Samantha" });
  });

  it("applies genuine additions, edits and removals", async () => {
    const before = await getRelationshipMap();
    const relationship = before.relationships[0];
    const result = await saveRelationshipMap({
      ...before,
      relationships: [{
        ...relationship,
        practices: [
          { ...relationship.practices[0], title: "Saturday walk", cadence: "Fortnightly", anchorDate: "2026-01-10" },
          { id: "practice-2", title: "Phone call", cadence: "Monthly", anchorDate: "2026-01-15" },
        ],
        importantDates: [],
      }],
    });

    expect(result.error).toBeUndefined();
    await expect(prisma.connectionPractice.findMany({ orderBy: { position: "asc" }, select: { id: true, title: true, cadence: true, anchorDate: true, position: true } })).resolves.toEqual([
      { id: "practice-1", title: "Saturday walk", cadence: "Fortnightly", anchorDate: new Date("2026-01-10T00:00:00.000Z"), position: 0 },
      { id: "practice-2", title: "Phone call", cadence: "Monthly", anchorDate: new Date("2026-01-15T00:00:00.000Z"), position: 1 },
    ]);
    // Removing the date takes its notification with it, which is the cascade
    // working as intended -- the point is that it only happens when the owner
    // actually removed the date.
    await expect(prisma.relationshipImportantDate.count()).resolves.toBe(0);
    await expect(prisma.notification.count()).resolves.toBe(0);
  });

  it("removes a person through their identity, taking their connections with them", async () => {
    const before = await getRelationshipMap();
    const result = await saveRelationshipMap({
      people: before.people.filter((person) => person.id !== "person-friend"),
      relationships: [],
    });

    expect(result.error).toBeUndefined();
    await expect(prisma.person.findMany({ select: { id: true } })).resolves.toEqual([{ id: "person-self" }]);
    await expect(prisma.object.findMany({ where: { id: "object-friend" } })).resolves.toEqual([]);
    await expect(prisma.relationship.count()).resolves.toBe(0);
    await expect(prisma.connectionPractice.count()).resolves.toBe(0);
  });

  it("writes a moved bubble without touching anything else", async () => {
    const result = await saveMapGeometry([{ id: "person-friend", x: 640, y: 480, size: 96 }]);

    expect(result.error).toBeUndefined();
    await expect(prisma.person.findUniqueOrThrow({ where: { id: "person-friend" } })).resolves.toMatchObject({ positionX: 640, positionY: 480, bubbleSize: 96 });
    await expect(prisma.connectionPractice.count()).resolves.toBe(1);
    await expect(prisma.relationshipImportantDate.count()).resolves.toBe(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores a position for a person who is not the owner's", async () => {
    const result = await saveMapGeometry([{ id: "person-friend", x: 1, y: 2, size: 84 }]);
    expect(result.error).toBeUndefined();

    mocks.requireKinesisUser.mockResolvedValue({ id: "someone-else" });
    await expect(saveMapGeometry([{ id: "person-friend", x: 999, y: 999, size: 140 }])).resolves.toMatchObject({ savedAt: expect.any(Number) });
    await expect(prisma.person.findUniqueOrThrow({ where: { id: "person-friend" } })).resolves.toMatchObject({ positionX: 1, positionY: 2 });
  });
});
