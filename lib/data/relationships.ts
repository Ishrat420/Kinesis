import { connection } from "next/server";
import { prisma } from "./prisma";
import type { ConnectionPracticeEntry, ImportantDateEntry, ReflectionEntry, RelationshipMapData } from "@/lib/relationships";
import { requireKinesisUser } from "@/lib/auth";
import { practiceAnchor } from "@/lib/calendar/recurrence";
import { formatDateInput } from "@/lib/dates";
import { objectFor } from "./objects";

/**
 * Child rows travel with their ids.
 *
 * They always had them in the database; the map simply never saw them, so a save
 * had no way to tell an edited practice from a new one and threw the lot away
 * every time. Sending the id is what lets `saveRelationshipMap` reconcile
 * instead of rebuild -- which is what keeps a practice's anchor date, and the
 * read state of an important date's notification, alive across an edit.
 */
type PracticeRow = { id: string; title: string; cadence: string | null; anchorDate: Date | null; createdAt: Date };
type ReflectionRow = { id: string; text: string; reflectedAt: Date };
type ImportantDateRow = { id: string; label: string; date: Date; repeatsYearly: boolean };

const toPractice = (practice: PracticeRow): ConnectionPracticeEntry => ({
  id: practice.id,
  title: practice.title,
  cadence: practice.cadence || "",
  anchorDate: formatDateInput(practiceAnchor(practice)),
});
const toReflection = (reflection: ReflectionRow): ReflectionEntry => ({
  id: reflection.id,
  text: reflection.text,
  date: formatDateInput(reflection.reflectedAt),
});
const toImportantDate = (importantDate: ImportantDateRow): ImportantDateEntry => ({
  id: importantDate.id,
  label: importantDate.label,
  date: formatDateInput(importantDate.date),
  repeatsYearly: importantDate.repeatsYearly,
});

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
    people: people.map((person) => ({ id: person.id, name: person.name, detail: person.isSelf ? "You" : person.category || "Relationship", x: person.positionX, y: person.positionY, size: person.bubbleSize, color: person.color, icon: person.icon as RelationshipMapData["people"][number]["icon"], selfRelationship: { practices: person.selfPractices.map(toPractice), reflections: person.selfReflections.map(toReflection), importantDates: person.selfImportantDates.map(toImportantDate), notes: person.selfNotes || "" } })),
    relationships: relationships.map((relationship) => ({ id: relationship.id, from: relationship.firstPersonId, to: relationship.secondPersonId, type: relationship.type, notes: relationship.notes || "", practices: relationship.practices.map(toPractice), reflections: relationship.reflections.map(toReflection), importantDates: relationship.importantDates.map(toImportantDate), linkedGoals: relationship.linkedGoals.map(({ goalId }) => goalId) })),
  };
}
