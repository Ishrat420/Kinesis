import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  deleteObjects: vi.fn(),
  tx: {
    goal: { count: vi.fn() },
    person: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    relationship: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    connectionPractice: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    relationshipReflection: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    relationshipImportantDate: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    relationshipGoal: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    activityEvent: { createMany: vi.fn() },
  },
  prisma: { $transaction: vi.fn(), person: { updateMany: vi.fn() } },
}));

vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/data/objects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/objects")>()),
  deleteObjects: mocks.deleteObjects,
}));

import { saveMapGeometry, saveRelationshipMap } from "@/app/(app)/relationships/actions";
import type { RelationshipMapData, RelationshipPerson } from "@/lib/relationships";

const person = (id: string, overrides: Partial<RelationshipPerson> = {}): RelationshipPerson => ({
  id, name: id, detail: "Friend", x: 10, y: 20, size: 84, color: "#292524", icon: "user",
  selfRelationship: { practices: [], reflections: [], importantDates: [], notes: "" },
  ...overrides,
});

const map = (overrides: Partial<RelationshipMapData> = {}): RelationshipMapData => ({
  people: [person("person-one"), person("person-two")],
  relationships: [{
    id: "relationship-id", from: "person-one", to: "person-two", type: null,
    practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "",
  }],
  ...overrides,
});

/** Every row the reconcile reads is empty unless a test says otherwise. */
function emptyDatabase() {
  mocks.tx.person.findMany.mockResolvedValue([]);
  mocks.tx.relationship.findMany.mockResolvedValue([]);
  mocks.tx.connectionPractice.findMany.mockResolvedValue([]);
  mocks.tx.relationshipReflection.findMany.mockResolvedValue([]);
  mocks.tx.relationshipImportantDate.findMany.mockResolvedValue([]);
  mocks.tx.relationshipGoal.findMany.mockResolvedValue([]);
}

describe("saveRelationshipMap authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.tx) => Promise<void>) => callback(mocks.tx));
    emptyDatabase();
  });

  it("rejects an unowned linked goal before writing anything", async () => {
    mocks.tx.goal.count.mockResolvedValue(1);

    const result = await saveRelationshipMap(map({
      relationships: [{
        id: "relationship-id", from: "person-one", to: "person-two", type: null,
        practices: [], reflections: [], linkedGoals: ["owned-goal", "another-users-goal"], importantDates: [], notes: "",
      }],
    }));

    expect(result).toEqual({ error: "One or more linked goals were not found." });
    expect(mocks.tx.goal.count).toHaveBeenCalledWith({
      where: { id: { in: ["owned-goal", "another-users-goal"] }, userId: "owner-id" },
    });
    expect(mocks.tx.person.create).not.toHaveBeenCalled();
    expect(mocks.tx.relationship.create).not.toHaveBeenCalled();
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a payload that fails validation without opening a transaction", async () => {
    const result = await saveRelationshipMap(map({ people: [person("person-one")] }));

    expect(result.error).toBe("A connection points at someone who is not on the map.");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("scopes a geometry write to the owner", async () => {
    mocks.prisma.$transaction.mockResolvedValue([]);

    const result = await saveMapGeometry([{ id: "person-one", x: 12, y: 34, size: 96 }]);

    expect(result.error).toBeUndefined();
    expect(mocks.prisma.person.updateMany).toHaveBeenCalledWith({
      where: { id: "person-one", userId: "owner-id" },
      data: { positionX: 12, positionY: 34, bubbleSize: 96 },
    });
  });
});

describe("saveRelationshipMap reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.tx) => Promise<void>) => callback(mocks.tx));
    emptyDatabase();
  });

  /**
   * The bug this whole change exists for: these rows used to be deleted and
   * re-created on every save, which reset each practice's schedule and threw
   * away the notification hanging off every important date.
   */
  it("leaves untouched people and their children alone", async () => {
    mocks.tx.person.findMany.mockResolvedValue([
      { id: "person-one", objectId: "object-one", name: "person-one", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
      { id: "person-two", objectId: "object-two", name: "person-two", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
    ]);
    mocks.tx.relationship.findMany.mockResolvedValue([
      { id: "relationship-id", firstPersonId: "person-one", secondPersonId: "person-two", type: null, notes: null },
    ]);

    const result = await saveRelationshipMap(map());

    expect(result.savedAt).toEqual(expect.any(Number));
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
    expect(mocks.tx.person.update).not.toHaveBeenCalled();
    expect(mocks.tx.person.create).not.toHaveBeenCalled();
    expect(mocks.tx.relationship.update).not.toHaveBeenCalled();
    expect(mocks.tx.relationshipImportantDate.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.connectionPractice.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps an edited practice's row and writes its anchor date", async () => {
    mocks.tx.person.findMany.mockResolvedValue([
      { id: "person-one", objectId: "object-one", name: "person-one", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
      { id: "person-two", objectId: "object-two", name: "person-two", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
    ]);
    mocks.tx.relationship.findMany.mockResolvedValue([
      { id: "relationship-id", firstPersonId: "person-one", secondPersonId: "person-two", type: null, notes: null },
    ]);
    // Every child collection is now read once for the whole map, so the rows
    // come back carrying the owner they belong to.
    mocks.tx.connectionPractice.findMany.mockResolvedValue([
      { id: "practice-id", title: "Walk", cadence: "Weekly", anchorDate: new Date("2026-01-04T00:00:00.000Z"), position: 0, relationshipId: "relationship-id", selfPersonId: null },
    ]);

    const result = await saveRelationshipMap(map({
      relationships: [{
        id: "relationship-id", from: "person-one", to: "person-two", type: null,
        practices: [{ id: "practice-id", title: "Sunday walk", cadence: "Weekly", anchorDate: "2026-01-04" }],
        reflections: [], linkedGoals: [], importantDates: [], notes: "",
      }],
    }));

    expect(result.error).toBeUndefined();
    expect(mocks.tx.connectionPractice.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.connectionPractice.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.connectionPractice.update).toHaveBeenCalledWith({
      where: { id: "practice-id" },
      data: { title: "Sunday walk", cadence: "Weekly", anchorDate: new Date("2026-01-04T00:00:00.000Z"), position: 0 },
    });
  });

  it("removes a person through their identity rather than a blanket delete", async () => {
    mocks.tx.person.findMany.mockResolvedValue([
      { id: "person-one", objectId: "object-one", name: "person-one", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
      { id: "person-two", objectId: "object-two", name: "person-two", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
      { id: "person-gone", objectId: "object-gone", name: "person-gone", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
    ]);
    mocks.tx.relationship.findMany.mockResolvedValue([
      { id: "relationship-id", firstPersonId: "person-one", secondPersonId: "person-two", type: null, notes: null },
    ]);

    await saveRelationshipMap(map());

    expect(mocks.deleteObjects).toHaveBeenCalledWith(mocks.tx, ["object-gone"], "owner-id");
  });

  /** A payload the map cannot produce, and one the unique pair would reject mid-write. */
  it("refuses to re-point an existing connection at different people", async () => {
    mocks.tx.person.findMany.mockResolvedValue([
      { id: "person-one", objectId: "object-one", name: "person-one", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
      { id: "person-two", objectId: "object-two", name: "person-two", category: "Friend", icon: "user", color: "#292524", isSelf: false, selfNotes: null },
    ]);
    mocks.tx.relationship.findMany.mockResolvedValue([
      { id: "relationship-id", firstPersonId: "person-two", secondPersonId: "person-one", type: null, notes: null },
    ]);

    const result = await saveRelationshipMap(map());

    expect(result).toEqual({ error: "A connection cannot be moved to different people." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
