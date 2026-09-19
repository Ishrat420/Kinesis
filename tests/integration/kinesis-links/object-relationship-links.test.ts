import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { getKinesisLinks } from "@/lib/data/object-relationships";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { addKinesisLinkAction, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";

/**
 * KD-049 Phase 2: the generalized form of goal-relationships.test.ts's own
 * coverage, run against Document<->Goal (rather than Goal<->Goal) to prove
 * the mechanism really is object-type-agnostic, plus the two behaviours
 * Phase 1's schema change exists for -- a second, differently-typed Kinesis
 * Link between the same pair succeeding, and a same-type one still refused.
 */

const owner = "kinesis-link-owner";
const stranger = "kinesis-link-stranger";

const asUser = (id: string) => mocks.requireKinesisUser.mockResolvedValue({ id });

async function makeDocument(userId: string, id: string, name: string) {
  const objectId = `object-${id}`;
  await prisma.object.create({ data: { id: objectId, type: "DOCUMENT", name, userId } });
  await prisma.document.create({ data: { id, name, type: "Identity", status: "Active", owner: "Owner", userId, objectId } });
  return objectId;
}

async function makeGoal(userId: string, id: string, name: string) {
  const objectId = `object-${id}`;
  await prisma.object.create({ data: { id: objectId, type: "GOAL", name, userId } });
  await prisma.goal.create({ data: { id, name, userId, objectId } });
  return objectId;
}

const add = (objectId: string, targetObjectId: string, direction: string, customLabel?: string) => {
  const data = new FormData();
  data.set("targetObjectId", targetObjectId);
  data.set("direction", direction);
  if (customLabel !== undefined) data.set("customLabel", customLabel);
  return addKinesisLinkAction(objectId, {}, data);
};

const retype = (objectId: string, relationshipId: string, direction: string, customLabel?: string) => {
  const data = new FormData();
  data.set("direction", direction);
  if (customLabel !== undefined) data.set("customLabel", customLabel);
  return updateKinesisLinkAction(objectId, relationshipId, data);
};

const onlyRelationship = () => prisma.objectRelationship.findFirstOrThrow();

describe.sequential("Kinesis Links over the shared Object layer (KD-049)", () => {
  let docObjectId: string;
  let goalObjectId: string;
  let strangerObjectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Link", lastName: "Owner", email: "kinesis-link-owner@example.test" },
        { id: stranger, firstName: "Some", lastName: "Stranger", email: "kinesis-link-stranger@example.test" },
      ],
    });
    docObjectId = await makeDocument(owner, "doc-a", "Mortgage pre-approval");
    goalObjectId = await makeGoal(owner, "goal-a", "Buy a house");
    strangerObjectId = await makeGoal(stranger, "goal-z", "Zeta");
    asUser(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("reading from either end, across two different object types", () => {
    it("reads a link from the source side as the forward label", async () => {
      await add(docObjectId, goalObjectId, "DEPENDS_ON|forward");

      const links = await getKinesisLinks(docObjectId);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ inverse: false, type: "DEPENDS_ON", label: "Depends on", target: { objectId: goalObjectId, name: "Buy a house" } });
    });

    it("reads the same link from the target side as the inverse label", async () => {
      await add(docObjectId, goalObjectId, "DEPENDS_ON|forward");

      const links = await getKinesisLinks(goalObjectId);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ inverse: true, type: "DEPENDS_ON", label: "Required for", target: { objectId: docObjectId, name: "Mortgage pre-approval" } });
    });

    it("keeps another owner's links out of view entirely", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");

      asUser(stranger);
      await expect(getKinesisLinks(docObjectId)).resolves.toEqual([]);
    });
  });

  describe("creating links", () => {
    it("refuses to link an object to itself without touching the database", async () => {
      await expect(add(docObjectId, docObjectId, "SUPPORTS|forward")).resolves.toEqual({ error: "An object cannot be linked to itself." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("refuses to link to an object owned by someone else", async () => {
      await expect(add(docObjectId, strangerObjectId, "SUPPORTS|forward")).resolves.toEqual({ error: "One or both of these no longer exist." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("stores the picked inverse direction with source and target swapped", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|inverse");

      await expect(onlyRelationship()).resolves.toMatchObject({ sourceObjectId: goalObjectId, targetObjectId: docObjectId, type: "SUPPORTS" });
    });

    it("rejects a same-type duplicate offered from either direction", async () => {
      await expect(add(docObjectId, goalObjectId, "SUPPORTS|forward")).resolves.toEqual({});

      await expect(add(docObjectId, goalObjectId, "SUPPORTS|forward")).resolves.toEqual({ error: "These are already linked this way." });
      await expect(add(goalObjectId, docObjectId, "SUPPORTS|inverse")).resolves.toEqual({ error: "These are already linked this way." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });

    /**
     * The behaviour Phase 1's schema change exists for: two Objects can hold
     * more than one relationship at once, as long as each is a different
     * type -- this used to be rejected outright when uniqueness was scoped
     * to the pair alone, regardless of type.
     */
    it("allows a second, differently-typed Kinesis Link between the same pair", async () => {
      await expect(add(docObjectId, goalObjectId, "SUPPORTS|forward")).resolves.toEqual({});
      await expect(add(docObjectId, goalObjectId, "ALONGSIDE|forward")).resolves.toEqual({});

      const links = await getKinesisLinks(docObjectId);
      expect(links.map((link) => link.label).sort()).toEqual(["Alongside", "Supports"]);
    });

    it("stores an ad-hoc custom label, shown the same from either side", async () => {
      await add(docObjectId, goalObjectId, "CUSTOM", "Renewal document");

      await expect(getKinesisLinks(docObjectId)).resolves.toMatchObject([{ label: "Renewal document" }]);
      await expect(getKinesisLinks(goalObjectId)).resolves.toMatchObject([{ label: "Renewal document" }]);
    });

    it("refuses a Custom choice with no text typed", async () => {
      await expect(add(docObjectId, goalObjectId, "CUSTOM", "")).resolves.toEqual({ error: "Type a label for this Kinesis Link." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    /**
     * KD-050: CUSTOM's uniqueness is per (pairKey, customLabel), not per
     * (pairKey, type) like every other type -- two different ad-hoc texts
     * between the same pair must both be allowed, since Custom's whole
     * point is arbitrary text, not a single canonical slot.
     */
    it("allows two differently-worded Custom Kinesis Links between the same pair", async () => {
      await expect(add(docObjectId, goalObjectId, "CUSTOM", "Renewal document")).resolves.toEqual({});
      await expect(add(docObjectId, goalObjectId, "CUSTOM", "Backup reference")).resolves.toEqual({});

      const links = await getKinesisLinks(docObjectId);
      expect(links.map((link) => link.label).sort()).toEqual(["Backup reference", "Renewal document"]);
    });

    it("still rejects an exact duplicate Custom label between the same pair", async () => {
      await expect(add(docObjectId, goalObjectId, "CUSTOM", "Renewal document")).resolves.toEqual({});
      await expect(add(docObjectId, goalObjectId, "CUSTOM", "Renewal document")).resolves.toEqual({ error: "These are already linked this way." });
      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });
  });

  describe("editing links", () => {
    it("retypes a link from the source side", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      await retype(docObjectId, id, "BLOCKS|forward");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "BLOCKS", sourceObjectId: docObjectId, targetObjectId: goalObjectId });
    });

    it("retypes a link from the target side, direction included", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      // Chosen from the Goal's own page: "Depends on" here means the Goal
      // depends on the Document, so the Document ends up as the target.
      await retype(goalObjectId, id, "DEPENDS_ON|forward");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "DEPENDS_ON", sourceObjectId: goalObjectId, targetObjectId: docObjectId });
    });

    it("ignores a retype requested by another owner", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      asUser(stranger);
      await retype(docObjectId, id, "BLOCKS|forward");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "SUPPORTS" });
    });

    it("ignores an unrecognised direction value", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      await retype(docObjectId, id, "NOT_A_VALUE");

      await expect(onlyRelationship()).resolves.toMatchObject({ type: "SUPPORTS" });
    });
  });

  describe("removing links", () => {
    it("removes a link without deleting either Object", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      await removeKinesisLinkAction(docObjectId, id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
      await expect(prisma.object.count({ where: { id: { in: [docObjectId, goalObjectId] } } })).resolves.toBe(2);
    });

    it("removes a link from the target side", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      await removeKinesisLinkAction(goalObjectId, id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(0);
    });

    it("ignores a removal requested by another owner", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      asUser(stranger);
      await removeKinesisLinkAction(docObjectId, id);

      await expect(prisma.objectRelationship.count()).resolves.toBe(1);
    });
  });

  describe("recording history (KD-048)", () => {
    it("writes a RELATIONSHIP_ADDED event on both linked objects, each reading its own side's label", async () => {
      await add(docObjectId, goalObjectId, "DEPENDS_ON|forward");

      const [onDoc, onGoal] = await Promise.all([getObjectEvents(docObjectId), getObjectEvents(goalObjectId)]);

      expect(onDoc).toMatchObject([{ description: "Depends on → Buy a house" }]);
      expect(onGoal).toMatchObject([{ description: "Required for → Mortgage pre-approval" }]);
    });

    it("snapshots the literal text on both sides for a Custom Kinesis Link", async () => {
      await add(docObjectId, goalObjectId, "CUSTOM", "Renewal document");

      const [onDoc, onGoal] = await Promise.all([getObjectEvents(docObjectId), getObjectEvents(goalObjectId)]);

      expect(onDoc).toMatchObject([{ description: "Renewal document → Buy a house" }]);
      expect(onGoal).toMatchObject([{ description: "Renewal document → Mortgage pre-approval" }]);
    });

    it("writes a RELATIONSHIP_CHANGED event on both sides when a link is retyped, not a remove-then-add pair", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();

      await retype(docObjectId, id, "BLOCKS|forward");

      const [onDoc, onGoal] = await Promise.all([getObjectEvents(docObjectId), getObjectEvents(goalObjectId)]);
      // Two events each, newest first -- the original add is a real fact
      // that stays in history; the retype appends a second fact describing
      // the same underlying link, rather than erasing the first.
      expect(onDoc).toMatchObject([{ description: "Supports → Blocks (Buy a house)" }, { description: "Supports → Buy a house" }]);
      expect(onGoal).toMatchObject([{ description: "Supported by → Blocked by (Mortgage pre-approval)" }, { description: "Supported by → Mortgage pre-approval" }]);
    });

    it("writes a RELATIONSHIP_REMOVED event on both sides when a link is removed, alongside the original add", async () => {
      await add(docObjectId, goalObjectId, "DEPENDS_ON|forward");
      const { id } = await onlyRelationship();

      await removeKinesisLinkAction(docObjectId, id);

      const [onDoc, onGoal] = await Promise.all([getObjectEvents(docObjectId), getObjectEvents(goalObjectId)]);
      expect(onDoc).toMatchObject([{ description: "No longer linked: Depends on → Buy a house" }, { description: "Depends on → Buy a house" }]);
      expect(onGoal).toMatchObject([{ description: "No longer linked: Required for → Mortgage pre-approval" }, { description: "Required for → Mortgage pre-approval" }]);
    });

    it("records nothing on either side when the add itself is refused", async () => {
      await add(docObjectId, docObjectId, "SUPPORTS|forward");

      await expect(getObjectEvents(docObjectId)).resolves.toEqual([]);
    });

    it("orders an object's own history newest first", async () => {
      await add(docObjectId, goalObjectId, "SUPPORTS|forward");
      const { id } = await onlyRelationship();
      await retype(docObjectId, id, "BLOCKS|forward");

      const onDoc = await getObjectEvents(docObjectId);

      expect(onDoc.map((event) => event.description)).toEqual(["Supports → Blocks (Buy a house)", "Supports → Buy a house"]);
      expect(onDoc[0].occurredAt.getTime()).toBeGreaterThanOrEqual(onDoc[1].occurredAt.getTime());
    });
  });
});
