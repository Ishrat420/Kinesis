"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { isSelfPerson, type RelationshipMapData } from "@/lib/relationships";
import { requireKinesisUser } from "@/lib/auth";

export async function saveRelationshipMap(data: RelationshipMapData) {
  const user = await requireKinesisUser();
  await prisma.$transaction(async (tx) => {
    const linkedGoalIds = [...new Set(data.relationships.flatMap((relationship) => relationship.linkedGoals))];
    if (linkedGoalIds.length) {
      const ownedGoals = await tx.goal.findMany({
        where: { id: { in: linkedGoalIds }, userId: user.id },
        select: { id: true },
      });
      if (ownedGoals.length !== linkedGoalIds.length) {
        throw new Error("One or more linked goals were not found.");
      }
    }

    const existingPeople = await tx.person.findMany({ where: { userId: user.id } });
    const existingById = new Map(existingPeople.map((person) => [person.id, person]));
    await tx.relationship.deleteMany({ where: { userId: user.id } });
    await tx.person.deleteMany({ where: { userId: user.id } });
    for (const person of data.people) {
      const existing = existingById.get(person.id);
      const object = existing
        ? { connect: { id: existing.objectId } }
        : { create: { type: "PERSON" as const, name: person.name, userId: user.id } };
      if (existing) await tx.object.update({ where: { id: existing.objectId }, data: { name: person.name } });
      await tx.person.create({ data: { id: person.id, user: { connect: { id: user.id } }, name: person.name, category: isSelfPerson(person) ? null : person.detail, isSelf: isSelfPerson(person), positionX: person.x, positionY: person.y, bubbleSize: person.size, color: person.color, icon: person.icon, selfNotes: person.selfRelationship.notes || null, object, selfPractices: { create: person.selfRelationship.practices.map((practice, position) => ({ id: crypto.randomUUID(), ...practice, position })) }, selfReflections: { create: person.selfRelationship.reflections.map((reflection) => ({ id: crypto.randomUUID(), text: reflection.text, reflectedAt: new Date(`${reflection.date}T00:00:00.000Z`) })) }, selfImportantDates: { create: person.selfRelationship.importantDates.map((date) => ({ id: crypto.randomUUID(), label: date.label, date: new Date(`${date.date}T00:00:00.000Z`) })) } } });
    }
    const retainedIds = new Set(data.people.map(({ id }) => id));
    const removedObjectIds = existingPeople.filter(({ id }) => !retainedIds.has(id)).map(({ objectId }) => objectId);
    if (removedObjectIds.length) await tx.object.deleteMany({ where: { id: { in: removedObjectIds }, userId: user.id } });
    for (const relationship of data.relationships) await tx.relationship.create({ data: { id: relationship.id, userId: user.id, firstPersonId: relationship.from, secondPersonId: relationship.to, type: relationship.type, notes: relationship.notes || null, practices: { create: relationship.practices.map((practice, position) => ({ id: crypto.randomUUID(), ...practice, position })) }, reflections: { create: relationship.reflections.map((reflection) => ({ id: crypto.randomUUID(), text: reflection.text, reflectedAt: new Date(`${reflection.date}T00:00:00.000Z`) })) }, importantDates: { create: relationship.importantDates.map((date) => ({ id: crypto.randomUUID(), label: date.label, date: new Date(`${date.date}T00:00:00.000Z`) })) }, linkedGoals: { create: relationship.linkedGoals.map((goalId) => ({ goalId })) } } });
    const activity = data.people.filter((person) => !isSelfPerson(person)).flatMap((person) => {
      const previous = existingById.get(person.id);
      const changed = previous && (previous.name !== person.name || (previous.category || "Relationship") !== person.detail || previous.icon !== person.icon || previous.color !== person.color || previous.bubbleSize !== person.size);
      if (previous && !changed) return [];
      return [{ id: crypto.randomUUID(), action: previous ? "Updated" : "Added", moduleName: "Relationships", objectName: person.name, icon: "relationships", href: "/relationships" }];
    });
    if (activity.length) await tx.activityEvent.createMany({ data: activity.map((item) => ({ ...item, userId: user.id })) });
  });
  revalidatePath("/", "layout");
}
