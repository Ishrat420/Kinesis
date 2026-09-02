import { connection } from "next/server";
import { prisma } from "./prisma";
import type { RelationshipMapData } from "@/lib/relationships";
import { requireKinesisUser } from "@/lib/auth";
import { objectFor } from "./objects";

export async function getRelationshipMap(defaultSelfName?: string): Promise<RelationshipMapData> {
  await connection();
  const user = await requireKinesisUser();
  if (defaultSelfName && await prisma.person.count({ where: { userId: user.id } }) === 0) {
    await prisma.person.create({ data: { id: crypto.randomUUID(), user: { connect: { id: user.id } }, name: defaultSelfName, category: null, isSelf: true, positionX: 488, positionY: 250, bubbleSize: 118, object: objectFor.person(defaultSelfName, user.id) } });
  }
  const [people, relationships] = await Promise.all([
    prisma.person.findMany({ where: { userId: user.id }, include: { selfPractices: { orderBy: { position: "asc" } }, selfReflections: { orderBy: { reflectedAt: "desc" } }, selfImportantDates: { orderBy: { date: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.relationship.findMany({ where: { userId: user.id }, include: { practices: { orderBy: { position: "asc" } }, reflections: { orderBy: { reflectedAt: "desc" } }, importantDates: { orderBy: { date: "asc" } }, linkedGoals: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    people: people.map((person) => ({ id: person.id, name: person.name, detail: person.isSelf ? "You" : person.category || "Relationship", x: person.positionX, y: person.positionY, size: person.bubbleSize, color: person.color, icon: person.icon as RelationshipMapData["people"][number]["icon"], selfRelationship: { practices: person.selfPractices.map(({ title, cadence }) => ({ title, cadence: cadence || "" })), reflections: person.selfReflections.map(({ text, reflectedAt }) => ({ text, date: reflectedAt.toISOString().slice(0, 10) })), importantDates: person.selfImportantDates.map(({ label, date, repeatsYearly }) => ({ label, date: date.toISOString().slice(0, 10), repeatsYearly })), notes: person.selfNotes || "" } })),
    relationships: relationships.map((relationship) => ({ id: relationship.id, from: relationship.firstPersonId, to: relationship.secondPersonId, type: relationship.type, notes: relationship.notes || "", practices: relationship.practices.map(({ title, cadence }) => ({ title, cadence: cadence || "" })), reflections: relationship.reflections.map(({ text, reflectedAt }) => ({ text, date: reflectedAt.toISOString().slice(0, 10) })), importantDates: relationship.importantDates.map(({ label, date, repeatsYearly }) => ({ label, date: date.toISOString().slice(0, 10), repeatsYearly })), linkedGoals: relationship.linkedGoals.map(({ goalId }) => goalId) })),
  };
}
