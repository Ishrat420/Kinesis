import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkPreviews } from "@/lib/data/kinesis-links";

/**
 * Documents, Goals and People have no Template, so their preview fields are
 * the hardcoded builders in lib/data/kinesis-links.ts (getDocumentPreviews,
 * getGoalPreviews, getPersonPreviews) rather than anything driven by user
 * configuration. These cover each builder's own rules directly against the
 * real database, the same way the Custom Item path is already covered end
 * to end.
 */

const owner = "built-in-preview-owner";

describe.sequential("built-in Module preview cards (Documents, Goals, People)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Preview", lastName: "Owner", email: "built-in-preview@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  describe("Documents", () => {
    async function seedDocument(overrides: Partial<{ documentNumber: string | null; country: string | null; expiryDate: Date | null }> = {}) {
      const object = await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: {
        id: "doc-1", userId: owner, objectId: object.id,
        name: "Passport", type: "Passport", status: "Active", owner: "Preview Owner",
        documentNumber: "P1234567", country: "Australia", expiryDate: new Date("2030-06-01T00:00:00.000Z"),
        ...overrides,
      } });
    }

    it("shows documentNumber, expiry and country, using the document's own labels", async () => {
      await seedDocument();
      await prisma.document.update({ where: { id: "doc-1" }, data: { documentNumberLabel: "Passport number" } });

      const previews = await getKinesisLinkPreviews(["doc-obj"]);
      expect(previews["doc-obj"]).toEqual([
        { label: "Passport number", kind: "text", value: "P1234567" },
        { label: "Expiry date", kind: "date", value: expect.any(String) },
        { label: "Country", kind: "text", value: "Australia" },
      ]);
    });

    it("omits a field that's empty rather than showing a blank stat", async () => {
      await seedDocument({ country: null, expiryDate: null });
      const previews = await getKinesisLinkPreviews(["doc-obj"]);
      expect(previews["doc-obj"]).toEqual([{ label: "Document number", kind: "text", value: "P1234567" }]);
    });

    it("has no entry at all when every field is empty", async () => {
      await seedDocument({ documentNumber: null, country: null, expiryDate: null });
      const previews = await getKinesisLinkPreviews(["doc-obj"]);
      expect(previews["doc-obj"]).toBeUndefined();
    });
  });

  describe("Goals", () => {
    async function seedGoal(overrides: Partial<{ targetValue: number | null; currentValue: number | null; unit: string | null; showMilestoneProgress: boolean; showTargetProgress: boolean }> = {}) {
      const object = await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
      await prisma.goal.create({ data: {
        id: "goal-1", userId: owner, objectId: object.id, name: "Read more",
        targetValue: 12, currentValue: 5, unit: "Books",
        ...overrides,
      } });
    }

    it("shows milestones completed and the measurable target", async () => {
      await seedGoal();
      await prisma.milestone.createMany({ data: [
        { id: "m1", goalId: "goal-1", name: "First", completed: true },
        { id: "m2", goalId: "goal-1", name: "Second", completed: false },
        { id: "m3", goalId: "goal-1", name: "Third", completed: true },
      ] });

      const previews = await getKinesisLinkPreviews(["goal-obj"]);
      expect(previews["goal-obj"]).toEqual([
        { label: "Milestones", kind: "text", value: "2 of 3 complete" },
        { label: "Books", kind: "text", value: "5 Books of 12 Books" },
      ]);
    });

    it("shows only the target when there are no milestones", async () => {
      await seedGoal();
      const previews = await getKinesisLinkPreviews(["goal-obj"]);
      expect(previews["goal-obj"]).toEqual([{ label: "Books", kind: "text", value: "5 Books of 12 Books" }]);
    });

    it("has no entry when there's no milestone or target data at all", async () => {
      await seedGoal({ targetValue: null, currentValue: null, unit: null });
      const previews = await getKinesisLinkPreviews(["goal-obj"]);
      expect(previews["goal-obj"]).toBeUndefined();
    });

    it("respects showMilestoneProgress/showTargetProgress the same way the goal's own page does", async () => {
      await seedGoal({ showMilestoneProgress: false, showTargetProgress: false });
      await prisma.milestone.create({ data: { id: "m1", goalId: "goal-1", name: "First", completed: true } });

      const previews = await getKinesisLinkPreviews(["goal-obj"]);
      expect(previews["goal-obj"]).toBeUndefined();
    });
  });

  describe("People", () => {
    async function seedPerson(overrides: Partial<{ isSelf: boolean; category: string | null }> = {}) {
      const object = await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Cat", userId: owner } });
      await prisma.person.create({ data: {
        id: "person-1", userId: owner, objectId: object.id, name: "Cat",
        category: "Family", isSelf: false,
        ...overrides,
      } });
    }

    it("shows the person's category as a status badge", async () => {
      await seedPerson();
      const previews = await getKinesisLinkPreviews(["person-obj"]);
      expect(previews["person-obj"]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);
    });

    it("falls back to a generic label when no category is set", async () => {
      await seedPerson({ category: null });
      const previews = await getKinesisLinkPreviews(["person-obj"]);
      expect(previews["person-obj"]).toEqual([{ label: "Relationship", kind: "status", value: "Relationship" }]);
    });

    it("shows 'You' for the self person regardless of category", async () => {
      await seedPerson({ isSelf: true, category: null });
      const previews = await getKinesisLinkPreviews(["person-obj"]);
      expect(previews["person-obj"]).toEqual([{ label: "Relationship", kind: "status", value: "You" }]);
    });
  });

  it("previews a Document and a Goal in the same batched call without either clobbering the other", async () => {
    const docObject = await prisma.object.create({ data: { id: "batch-doc-obj", type: "DOCUMENT", name: "Visa", userId: owner } });
    await prisma.document.create({ data: { id: "batch-doc", userId: owner, objectId: docObject.id, name: "Visa", type: "Visa", status: "Active", owner: "Preview Owner", documentNumber: "V999", country: null } });
    const goalObject = await prisma.object.create({ data: { id: "batch-goal-obj", type: "GOAL", name: "Save money", userId: owner } });
    await prisma.goal.create({ data: { id: "batch-goal", userId: owner, objectId: goalObject.id, name: "Save money", targetValue: 1000, currentValue: 250, unit: "$AUD" } });

    const previews = await getKinesisLinkPreviews(["batch-doc-obj", "batch-goal-obj"]);
    expect(previews["batch-doc-obj"]).toEqual([{ label: "Document number", kind: "text", value: "V999" }]);
    expect(previews["batch-goal-obj"]).toEqual([{ label: "$AUD", kind: "text", value: "$AUD 250 of $AUD 1,000" }]);
  });
});
