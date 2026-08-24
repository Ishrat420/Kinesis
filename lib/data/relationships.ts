import { connection } from "next/server";
import { prisma } from "./prisma";
import type { RelationshipMapData } from "@/lib/relationships";

export async function getRelationshipMap(defaultSelfName?: string): Promise<RelationshipMapData> {
  await connection();
  if (defaultSelfName && await prisma.person.count() === 0) {
    await prisma.person.upsert({ where: { id: "self" }, create: { id: "self", name: defaultSelfName, category: null, isSelf: true, positionX: 488, positionY: 250, bubbleSize: 118 }, update: {} });
  }
  const [people, relationships] = await Promise.all([
    prisma.person.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.relationship.findMany({ include: { practices: { orderBy: { position: "asc" } }, reflections: { orderBy: { reflectedAt: "desc" } }, importantDates: { orderBy: { date: "asc" } }, linkedGoals: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    people: people.map((person) => ({ id: person.id, name: person.name, detail: person.isSelf ? "You" : person.category || "Relationship", x: person.positionX, y: person.positionY, size: person.bubbleSize, color: person.color, icon: person.icon as RelationshipMapData["people"][number]["icon"] })),
    relationships: relationships.map((relationship) => ({ id: relationship.id, from: relationship.firstPersonId, to: relationship.secondPersonId, type: relationship.type, notes: relationship.notes || "", practices: relationship.practices.map(({ title, cadence }) => ({ title, cadence: cadence || "" })), reflections: relationship.reflections.map(({ text, reflectedAt }) => ({ text, date: reflectedAt.toISOString().slice(0, 10) })), importantDates: relationship.importantDates.map(({ label, date }) => ({ label, date: date.toISOString().slice(0, 10) })), linkedGoals: relationship.linkedGoals.map(({ goalId }) => goalId) })),
  };
}
