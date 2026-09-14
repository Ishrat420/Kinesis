import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/data/prisma";

/**
 * KD-032, option 4: database-level backstops for the two gaps application
 * code alone used to be the only thing preventing.
 *
 * These call `prisma` directly rather than through any action, on purpose --
 * every real write path already checks ownership before it writes (or, for
 * the three relationship child tables, always sets exactly one parent), so
 * the only way to exercise what the database itself now refuses is to bypass
 * that application code, the way a bug or a future write path could.
 */

const owner = "ownership-integrity-owner";
const stranger = "ownership-integrity-stranger";

describe.sequential("relationship and object ownership integrity", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Owner", lastName: "One", email: "ownership-owner@example.test" },
        { id: stranger, firstName: "Stranger", lastName: "Two", email: "ownership-stranger@example.test" },
      ],
    });
    await prisma.object.createMany({
      data: [
        { id: "ownership-owner-object-a", type: "PERSON", name: "Owner Person A", userId: owner },
        { id: "ownership-owner-object-b", type: "PERSON", name: "Owner Person B", userId: owner },
        { id: "ownership-stranger-object", type: "PERSON", name: "Stranger Person", userId: stranger },
      ],
    });
    await prisma.person.createMany({
      data: [
        { id: "ownership-owner-person-a", name: "Owner Person A", userId: owner, objectId: "ownership-owner-object-a" },
        { id: "ownership-owner-person-b", name: "Owner Person B", userId: owner, objectId: "ownership-owner-object-b" },
        { id: "ownership-stranger-person", name: "Stranger Person", userId: stranger, objectId: "ownership-stranger-object" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  describe("gap B: reference ownership agreement", () => {
    it("creates a Relationship whose two Persons agree with its own owner", async () => {
      await expect(prisma.relationship.create({
        data: { id: "ownership-rel-valid", userId: owner, firstPersonId: "ownership-owner-person-a", secondPersonId: "ownership-owner-person-b" },
      })).resolves.toMatchObject({ id: "ownership-rel-valid" });
    });

    it("refuses a Relationship that reaches across accounts", async () => {
      await expect(prisma.relationship.create({
        data: { id: "ownership-rel-cross", userId: owner, firstPersonId: "ownership-owner-person-a", secondPersonId: "ownership-stranger-person" },
      })).rejects.toThrow(/is owned by .* and cannot connect Person/);
      expect(await prisma.relationship.count({ where: { id: "ownership-rel-cross" } })).toBe(0);
    });

    it("creates an ObjectRelationship whose two Objects agree with its own owner", async () => {
      await expect(prisma.objectRelationship.create({
        data: {
          id: "ownership-objrel-valid", userId: owner, type: "RELATES_TO",
          sourceObjectId: "ownership-owner-object-a", targetObjectId: "ownership-owner-object-b",
          pairKey: "ownership-owner-object-a:ownership-owner-object-b",
        },
      })).resolves.toMatchObject({ id: "ownership-objrel-valid" });
    });

    it("refuses an ObjectRelationship that reaches across accounts", async () => {
      await expect(prisma.objectRelationship.create({
        data: {
          id: "ownership-objrel-cross", userId: owner, type: "RELATES_TO",
          sourceObjectId: "ownership-owner-object-a", targetObjectId: "ownership-stranger-object",
          pairKey: "ownership-owner-object-a:ownership-stranger-object",
        },
      })).rejects.toThrow(/is owned by .* and cannot connect Object/);
      expect(await prisma.objectRelationship.count({ where: { id: "ownership-objrel-cross" } })).toBe(0);
    });

    it("creates a FieldLink whose field and target agree with each other", async () => {
      await prisma.objectField.create({ data: { id: "ownership-field-owner", objectId: "ownership-owner-object-a", label: "Link", value: "" } });
      await expect(prisma.fieldLink.create({
        data: { id: "ownership-fieldlink-valid", fieldId: "ownership-field-owner", targetObjectId: "ownership-owner-object-b" },
      })).resolves.toMatchObject({ id: "ownership-fieldlink-valid" });
    });

    it("refuses a FieldLink whose field and target belong to different accounts", async () => {
      await prisma.objectField.create({ data: { id: "ownership-field-owner-2", objectId: "ownership-owner-object-a", label: "Link", value: "" } });
      await expect(prisma.fieldLink.create({
        data: { id: "ownership-fieldlink-cross", fieldId: "ownership-field-owner-2", targetObjectId: "ownership-stranger-object" },
      })).rejects.toThrow(/cannot point a field owned by .* at Object/);
      expect(await prisma.fieldLink.count({ where: { id: "ownership-fieldlink-cross" } })).toBe(0);
    });
  });

  describe("gap A: exactly one parent", () => {
    it("accepts a ConnectionPractice with exactly one parent set", async () => {
      await prisma.relationship.create({ data: { id: "exactly-one-rel", userId: owner, firstPersonId: "ownership-owner-person-a", secondPersonId: "ownership-owner-person-b" } });
      await expect(prisma.connectionPractice.create({
        data: { id: "exactly-one-practice-ok", relationshipId: "exactly-one-rel", title: "Walk" },
      })).resolves.toMatchObject({ id: "exactly-one-practice-ok" });
    });

    it("refuses a ConnectionPractice with no parent set", async () => {
      await expect(prisma.connectionPractice.create({
        data: { id: "exactly-one-practice-none", title: "Walk" },
      })).rejects.toThrow(/ConnectionPractice_exactly_one_parent/);
    });

    it("refuses a ConnectionPractice with both parents set", async () => {
      await prisma.relationship.create({ data: { id: "exactly-one-rel-2", userId: owner, firstPersonId: "ownership-owner-person-a", secondPersonId: "ownership-owner-person-b" } });
      await expect(prisma.connectionPractice.create({
        data: { id: "exactly-one-practice-both", relationshipId: "exactly-one-rel-2", selfPersonId: "ownership-owner-person-a", title: "Walk" },
      })).rejects.toThrow(/ConnectionPractice_exactly_one_parent/);
    });

    it("refuses a NotificationRead naming no target", async () => {
      await expect(prisma.notificationRead.create({
        data: { id: "exactly-one-notif-none", itemKey: "k1", userId: owner },
      })).rejects.toThrow(/NotificationRead_exactly_one_parent/);
    });

    it("accepts a NotificationRead naming exactly one target", async () => {
      await prisma.object.create({ data: { id: "exactly-one-todo-object", type: "TODO", name: "Renew", userId: owner } });
      await prisma.todo.create({ data: { id: "exactly-one-todo", name: "Renew", userId: owner, objectId: "exactly-one-todo-object" } });
      await expect(prisma.notificationRead.create({
        data: { id: "exactly-one-notif-ok", itemKey: "k2", userId: owner, todoId: "exactly-one-todo" },
      })).resolves.toMatchObject({ id: "exactly-one-notif-ok" });
    });

    it("refuses an AttentionDismissal naming no target", async () => {
      await expect(prisma.attentionDismissal.create({
        data: { id: "exactly-one-dismissal-none", itemKey: "k3", userId: owner },
      })).rejects.toThrow(/AttentionDismissal_exactly_one_parent/);
    });
  });
});
