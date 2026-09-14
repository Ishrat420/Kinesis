import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkPreviews } from "@/lib/data/kinesis-links";

/**
 * Documents, Goals, People and Finance items have no Template, so their
 * preview fields are the hardcoded builders in lib/data/kinesis-links.ts
 * (getDocumentPreviews, getGoalPreviews, getPersonPreviews,
 * getFinanceItemPreviews) rather than anything driven by user
 * configuration. These cover each builder's own rules directly against the
 * real database, the same way the Custom Item path is already covered end
 * to end.
 */

const owner = "built-in-preview-owner";

describe.sequential("built-in Module preview cards (Documents, Goals, People, Finance)", () => {
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
    async function seedSelf() {
      const object = await prisma.object.create({ data: { id: "self-obj", type: "PERSON", name: "Me", userId: owner } });
      await prisma.person.create({ data: { id: "self-1", userId: owner, objectId: object.id, name: "Me", isSelf: true } });
    }

    async function seedPerson(id: string, name: string) {
      const object = await prisma.object.create({ data: { id: `${id}-obj`, type: "PERSON", name, userId: owner } });
      await prisma.person.create({ data: { id, userId: owner, objectId: object.id, name, isSelf: false } });
      return `${id}-obj`;
    }

    it("shows the type of the person's relationship to the self person, not Person.category", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      await prisma.relationship.create({ data: { id: "rel-1", userId: owner, firstPersonId: "self-1", secondPersonId: "cat", type: "Family" } });

      const previews = await getKinesisLinkPreviews([catObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);
    });

    it("prefers the relationship to the self person when there's more than one", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      const dogObjectId = await seedPerson("dog", "Dog");
      await prisma.relationship.create({ data: { id: "rel-self-cat", userId: owner, firstPersonId: "cat", secondPersonId: "self-1", type: "Family" } });
      await prisma.relationship.create({ data: { id: "rel-cat-dog", userId: owner, firstPersonId: "cat", secondPersonId: "dog", type: "Friend" } });

      const previews = await getKinesisLinkPreviews([catObjectId, dogObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);
      // Dog's own only relationship isn't to self, so falls back to it -- not
      // affected by Cat having one that took priority for Cat's own card.
      expect(previews[dogObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Friend" }]);
    });

    it("falls back to any relationship when none is to the self person", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      await seedPerson("dog", "Dog");
      await prisma.relationship.create({ data: { id: "rel-cat-dog", userId: owner, firstPersonId: "cat", secondPersonId: "dog", type: "Friend" } });

      const previews = await getKinesisLinkPreviews([catObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Friend" }]);
    });

    it("has no entry for a person with no relationships at all", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      const previews = await getKinesisLinkPreviews([catObjectId]);
      expect(previews[catObjectId]).toBeUndefined();
    });

    it("has no entry when the relationship has no type set", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      await prisma.relationship.create({ data: { id: "rel-1", userId: owner, firstPersonId: "self-1", secondPersonId: "cat", type: null } });

      const previews = await getKinesisLinkPreviews([catObjectId]);
      expect(previews[catObjectId]).toBeUndefined();
    });

    it("shows 'You' for the self person regardless of their relationships", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      await prisma.relationship.create({ data: { id: "rel-1", userId: owner, firstPersonId: "self-1", secondPersonId: "cat", type: "Family" } });

      const previews = await getKinesisLinkPreviews(["self-obj", catObjectId]);
      expect(previews["self-obj"]).toEqual([{ label: "Relationship", kind: "status", value: "You" }]);
    });

    it("deterministically prefers the earliest-created relationship when falling back with several non-self ones", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      const dogObjectId = await seedPerson("dog", "Dog");
      const birdObjectId = await seedPerson("bird", "Bird");
      // Created out of alphabetical/id order on purpose, so a passing test
      // can't be an accident of iteration order matching creation order.
      await prisma.relationship.create({ data: { id: "rel-cat-bird", userId: owner, firstPersonId: "bird", secondPersonId: "cat", type: "Second", createdAt: new Date("2026-02-01T00:00:00.000Z") } });
      await prisma.relationship.create({ data: { id: "rel-cat-dog", userId: owner, firstPersonId: "cat", secondPersonId: "dog", type: "First", createdAt: new Date("2026-01-01T00:00:00.000Z") } });

      const previews = await getKinesisLinkPreviews([catObjectId, dogObjectId, birdObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "First" }]);
    });

    it("keeps each person's own relationship type independent when several are previewed in one batch", async () => {
      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      const dogObjectId = await seedPerson("dog", "Dog");
      await prisma.relationship.create({ data: { id: "rel-self-cat", userId: owner, firstPersonId: "self-1", secondPersonId: "cat", type: "Family" } });
      await prisma.relationship.create({ data: { id: "rel-self-dog", userId: owner, firstPersonId: "self-1", secondPersonId: "dog", type: "Friend" } });

      const previews = await getKinesisLinkPreviews([catObjectId, dogObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);
      expect(previews[dogObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Friend" }]);
    });

    it("never shows another account's relationship, even for a same-shaped person id", async () => {
      const otherOwner = "built-in-preview-other-owner";
      await prisma.user.deleteMany({ where: { id: otherOwner } });
      await prisma.user.create({ data: { id: otherOwner, firstName: "Other", lastName: "Owner", email: "built-in-preview-other@example.test" } });
      const otherSelfObject = await prisma.object.create({ data: { id: "other-self-obj", type: "PERSON", name: "Someone else", userId: otherOwner } });
      await prisma.person.create({ data: { id: "other-self", userId: otherOwner, objectId: otherSelfObject.id, name: "Someone else", isSelf: true } });
      const otherCatObject = await prisma.object.create({ data: { id: "other-cat-obj", type: "PERSON", name: "Other Cat", userId: otherOwner } });
      await prisma.person.create({ data: { id: "other-cat", userId: otherOwner, objectId: otherCatObject.id, name: "Other Cat", isSelf: false } });
      await prisma.relationship.create({ data: { id: "other-rel", userId: otherOwner, firstPersonId: "other-self", secondPersonId: "other-cat", type: "Confidential" } });

      await seedSelf();
      const catObjectId = await seedPerson("cat", "Cat");
      await prisma.relationship.create({ data: { id: "rel-1", userId: owner, firstPersonId: "self-1", secondPersonId: "cat", type: "Family" } });

      const previews = await getKinesisLinkPreviews([catObjectId]);
      expect(previews[catObjectId]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);

      await prisma.user.deleteMany({ where: { id: otherOwner } });
    });

    it("has no entry for a Person object id that belongs to another account", async () => {
      const otherOwner = "built-in-preview-other-owner-2";
      await prisma.user.deleteMany({ where: { id: otherOwner } });
      await prisma.user.create({ data: { id: otherOwner, firstName: "Other", lastName: "Owner", email: "built-in-preview-other-2@example.test" } });
      const otherObject = await prisma.object.create({ data: { id: "not-mine-obj", type: "PERSON", name: "Not mine", userId: otherOwner } });
      await prisma.person.create({ data: { id: "not-mine", userId: otherOwner, objectId: otherObject.id, name: "Not mine", isSelf: false, category: "Friend" } });

      const previews = await getKinesisLinkPreviews(["not-mine-obj"]);
      expect(previews["not-mine-obj"]).toBeUndefined();

      await prisma.user.deleteMany({ where: { id: otherOwner } });
    });
  });

  describe("Finance", () => {
    async function seedFinanceItem(kind: string, overrides: Partial<{ category: string | null; rate: number | null; frequency: string | null }> = {}) {
      const object = await prisma.object.create({ data: { id: "finance-obj", type: "FINANCE_ITEM", name: "Item", userId: owner } });
      await prisma.financeItem.create({ data: {
        id: "finance-1", userId: owner, objectId: object.id, name: "Item", kind, amount: 500,
        ...overrides,
      } });
    }

    it("shows amount, category and interest rate for an asset", async () => {
      await seedFinanceItem("asset", { category: "Savings", rate: 4.5 });
      const previews = await getKinesisLinkPreviews(["finance-obj"]);
      expect(previews["finance-obj"]).toEqual([
        { label: "Amount", kind: "currency", value: "$500" },
        { label: "Category", kind: "status", value: "Savings" },
        { label: "Interest rate", kind: "percent", value: "4.5%" },
      ]);
    });

    it("labels the amount 'Balance' for a liability, not 'Amount'", async () => {
      await seedFinanceItem("liability", { category: "Credit Card", rate: 19.9 });
      const previews = await getKinesisLinkPreviews(["finance-obj"]);
      expect(previews["finance-obj"]).toEqual([
        { label: "Balance", kind: "currency", value: "$500" },
        { label: "Category", kind: "status", value: "Credit Card" },
        { label: "Interest rate", kind: "percent", value: "19.9%" },
      ]);
    });

    it("drops the interest rate when none is set, keeping amount and category", async () => {
      await seedFinanceItem("asset", { category: "Vehicle", rate: null });
      const previews = await getKinesisLinkPreviews(["finance-obj"]);
      expect(previews["finance-obj"]).toEqual([
        { label: "Amount", kind: "currency", value: "$500" },
        { label: "Category", kind: "status", value: "Vehicle" },
      ]);
    });

    it("shows amount and frequency for income, never category or interest rate", async () => {
      await seedFinanceItem("income", { frequency: "Monthly" });
      const previews = await getKinesisLinkPreviews(["finance-obj"]);
      expect(previews["finance-obj"]).toEqual([
        { label: "Amount", kind: "currency", value: "$500" },
        { label: "Frequency", kind: "status", value: "Monthly" },
      ]);
    });

    it("shows amount and frequency for an expense", async () => {
      await seedFinanceItem("expense", { frequency: "Weekly" });
      const previews = await getKinesisLinkPreviews(["finance-obj"]);
      expect(previews["finance-obj"]).toEqual([
        { label: "Amount", kind: "currency", value: "$500" },
        { label: "Frequency", kind: "status", value: "Weekly" },
      ]);
    });
  });

  it("previews every built-in Module in the same batched call without any of them clobbering another", async () => {
    const docObject = await prisma.object.create({ data: { id: "batch-doc-obj", type: "DOCUMENT", name: "Visa", userId: owner } });
    await prisma.document.create({ data: { id: "batch-doc", userId: owner, objectId: docObject.id, name: "Visa", type: "Visa", status: "Active", owner: "Preview Owner", documentNumber: "V999", country: null } });
    const goalObject = await prisma.object.create({ data: { id: "batch-goal-obj", type: "GOAL", name: "Save money", userId: owner } });
    await prisma.goal.create({ data: { id: "batch-goal", userId: owner, objectId: goalObject.id, name: "Save money", targetValue: 1000, currentValue: 250, unit: "$AUD" } });
    const selfObject = await prisma.object.create({ data: { id: "batch-self-obj", type: "PERSON", name: "Me", userId: owner } });
    await prisma.person.create({ data: { id: "batch-self", userId: owner, objectId: selfObject.id, name: "Me", isSelf: true } });
    const personObject = await prisma.object.create({ data: { id: "batch-person-obj", type: "PERSON", name: "Cat", userId: owner } });
    await prisma.person.create({ data: { id: "batch-person", userId: owner, objectId: personObject.id, name: "Cat", isSelf: false } });
    await prisma.relationship.create({ data: { id: "batch-rel", userId: owner, firstPersonId: "batch-self", secondPersonId: "batch-person", type: "Family" } });
    const financeObject = await prisma.object.create({ data: { id: "batch-finance-obj", type: "FINANCE_ITEM", name: "Savings", userId: owner } });
    await prisma.financeItem.create({ data: { id: "batch-finance", userId: owner, objectId: financeObject.id, name: "Savings", kind: "asset", amount: 1200, category: "Savings" } });

    const previews = await getKinesisLinkPreviews(["batch-doc-obj", "batch-goal-obj", "batch-person-obj", "batch-finance-obj"]);
    expect(previews["batch-doc-obj"]).toEqual([{ label: "Document number", kind: "text", value: "V999" }]);
    expect(previews["batch-goal-obj"]).toEqual([{ label: "$AUD", kind: "text", value: "$AUD 250 of $AUD 1,000" }]);
    expect(previews["batch-person-obj"]).toEqual([{ label: "Relationship", kind: "status", value: "Family" }]);
    expect(previews["batch-finance-obj"]).toEqual([
      { label: "Amount", kind: "currency", value: "$1,200" },
      { label: "Category", kind: "status", value: "Savings" },
    ]);
  });
});
