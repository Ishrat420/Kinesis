import { vi } from "vitest";

export const auth = vi.hoisted(() => ({
  current: null as null | { id: string; firstName: string; lastName: string; preferredName: string | null; email: string },
  requireKinesisUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: auth.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";

export const ids = {
  ownerA: "authorization-owner-a",
  ownerB: "authorization-owner-b",
  documentA: "owner-a-private-document",
  documentB: "owner-b-private-document",
  documentFieldA: "owner-a-document-field",
  documentFieldB: "owner-b-document-field",
  goalA: "owner-a-goal",
  goalB: "owner-b-goal",
  milestoneA: "owner-a-milestone",
  milestoneB: "owner-b-milestone",
  financeA: "owner-a-finance-item",
  financeB: "owner-b-finance-item",
  moduleA: "owner-a-custom-module",
  moduleB: "owner-b-custom-module",
  itemA: "owner-a-custom-item",
  itemB: "owner-b-custom-item",
  itemFieldA: "owner-a-custom-field",
  itemFieldB: "owner-b-custom-field",
  notificationA: "owner-a-notification",
  notificationB: "owner-b-notification",
  personA1: "owner-a-self",
  personA2: "owner-a-person",
  personB1: "owner-b-self",
  personB2: "owner-b-person",
  relationshipA: "owner-a-relationship",
  relationshipB: "owner-b-relationship",
} as const;

export type FixtureOwner = "ownerA" | "ownerB";

export function authenticateAs(owner: FixtureOwner) {
  const user = auth.current = {
    id: ids[owner],
    firstName: owner === "ownerA" ? "Owner A" : "Owner B",
    lastName: "Private",
    preferredName: null,
    email: `${owner.toLowerCase()}@example.test`,
  };
  auth.requireKinesisUser.mockImplementation(async () => auth.current ?? user);
  return user;
}

export async function resetAuthorizationDatabase() {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      id: ids.ownerA, firstName: "Owner A", lastName: "Private", email: "owner-a@example.test",
      documents: { create: { id: ids.documentA, name: ids.documentA, type: "Owner A Type", status: "Active", owner: "Owner A", notes: "owner-a-document-notes", customFields: { create: { id: ids.documentFieldA, label: "A secret", value: "owner-a-field-value" } } } },
      documentTypes: { create: { id: "owner-a-document-type", name: "Owner A Type" } },
      goals: { create: { id: ids.goalA, name: ids.goalA, note: "owner-a-goal-note", targetValue: 100, currentValue: 10, milestones: { create: { id: ids.milestoneA, name: "owner-a-milestone", dueDate: new Date("2030-01-01T23:59:59.999Z") } } } },
      financeItems: { create: { id: ids.financeA, kind: "asset", name: "owner-a-finance", amount: 100 } },
      customModules: { create: { id: ids.moduleA, name: "Owner A Module", normalizedName: "owner a module", icon: "star", color: "#111111", items: { create: { id: ids.itemA, name: "owner-a-private-item", notes: "owner-a-item-notes", fields: { create: { id: ids.itemFieldA, label: "A field", value: "owner-a-item-field" } } } } } },
    },
  });
  await prisma.user.create({
    data: {
      id: ids.ownerB, firstName: "Owner B", lastName: "Private", email: "owner-b@example.test",
      documents: { create: { id: ids.documentB, name: ids.documentB, type: "Owner B Type", status: "Active", owner: "Owner B", notes: "owner-b-document-notes", customFields: { create: { id: ids.documentFieldB, label: "B secret", value: "owner-b-field-value" } } } },
      documentTypes: { create: { id: "owner-b-document-type", name: "Owner B Type" } },
      goals: { create: { id: ids.goalB, name: ids.goalB, note: "owner-b-goal-note", targetValue: 200, currentValue: 20, milestones: { create: { id: ids.milestoneB, name: "owner-b-milestone", dueDate: new Date("2030-02-01T23:59:59.999Z") } } } },
      financeItems: { create: { id: ids.financeB, kind: "asset", name: "owner-b-finance", amount: 200 } },
      customModules: { create: { id: ids.moduleB, name: "Owner B Module", normalizedName: "owner b module", icon: "star", color: "#222222", items: { create: { id: ids.itemB, name: "owner-b-private-item", notes: "owner-b-item-notes", fields: { create: { id: ids.itemFieldB, label: "B field", value: "owner-b-item-field" } } } } } },
    },
  });
  await prisma.notification.createMany({ data: [
    { id: ids.notificationA, userId: ids.ownerA, type: "REMINDER_DUE", documentId: ids.documentA, documentName: ids.documentA, message: "owner-a-notification", actionUrl: "/documents/a" },
    { id: ids.notificationB, userId: ids.ownerB, type: "REMINDER_DUE", documentId: ids.documentB, documentName: ids.documentB, message: "owner-b-notification", actionUrl: "/documents/b" },
  ] });
  await prisma.person.createMany({ data: [
    { id: ids.personA1, userId: ids.ownerA, name: "Owner A self", isSelf: true },
    { id: ids.personA2, userId: ids.ownerA, name: "owner-a-private-person" },
    { id: ids.personB1, userId: ids.ownerB, name: "Owner B self", isSelf: true },
    { id: ids.personB2, userId: ids.ownerB, name: "owner-b-private-person" },
  ] });
  await prisma.relationship.createMany({ data: [
    { id: ids.relationshipA, userId: ids.ownerA, firstPersonId: ids.personA1, secondPersonId: ids.personA2, notes: "owner-a-relationship-notes" },
    { id: ids.relationshipB, userId: ids.ownerB, firstPersonId: ids.personB1, secondPersonId: ids.personB2, notes: "owner-b-relationship-notes" },
  ] });
  authenticateAs("ownerA");
}

export async function ownerState(owner: FixtureOwner) {
  const userId = ids[owner];
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, include: {
    documents: { include: { customFields: true, notifications: true } }, documentTypes: true,
    goals: { include: { milestones: { include: { notifications: true } }, metricHistory: true } },
    financeItems: true, customModules: { include: { items: { include: { fields: true } } } },
    people: { include: { selfPractices: true, selfReflections: true, selfImportantDates: true } },
    relationships: { include: { practices: true, reflections: true, importantDates: true, linkedGoals: true } },
    goalUnits: true, notifications: true, activityEvents: true,
  } });
}
