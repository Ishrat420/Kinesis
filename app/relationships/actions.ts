"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import type { RelationshipMapData } from "@/lib/relationships";
import { requireKinesisUser } from "@/lib/auth";

export async function saveRelationshipMap(data: RelationshipMapData) {
  const user = await requireKinesisUser();
  await prisma.$transaction(async (tx) => {
    const existingPeople = await tx.person.findMany({ where: { userId: user.id } });
    const existingById = new Map(existingPeople.map((person) => [person.id, person]));
    await tx.relationship.deleteMany({ where: { userId: user.id } });
    await tx.person.deleteMany({ where: { userId: user.id } });
    for (const person of data.people) await tx.person.create({ data: { id: person.id, userId: user.id, name: person.name, category: person.detail === "You" ? null : person.detail, isSelf: person.detail === "You", positionX: person.x, positionY: person.y, bubbleSize: person.size, color: person.color, icon: person.icon } });
    for (const relationship of data.relationships) await tx.relationship.create({ data: { id: relationship.id, userId: user.id, firstPersonId: relationship.from, secondPersonId: relationship.to, type: relationship.type, notes: relationship.notes || null, practices: { create: relationship.practices.map((practice, position) => ({ id: crypto.randomUUID(), ...practice, position })) }, reflections: { create: relationship.reflections.map((reflection) => ({ id: crypto.randomUUID(), text: reflection.text, reflectedAt: new Date(`${reflection.date}T00:00:00.000Z`) })) }, importantDates: { create: relationship.importantDates.map((date) => ({ id: crypto.randomUUID(), label: date.label, date: new Date(`${date.date}T00:00:00.000Z`) })) }, linkedGoals: { create: relationship.linkedGoals.map((goalId) => ({ goalId })) } } });
    const activity = data.people.filter((person) => person.detail !== "You").flatMap((person) => {
      const previous = existingById.get(person.id);
      const changed = previous && (previous.name !== person.name || (previous.category || "Relationship") !== person.detail || previous.icon !== person.icon || previous.color !== person.color || previous.bubbleSize !== person.size);
      if (previous && !changed) return [];
      return [{ id: crypto.randomUUID(), action: previous ? "Updated" : "Added", moduleName: "Relationships", objectName: person.name, icon: "relationships", href: "/relationships" }];
    });
    if (activity.length) await tx.activityEvent.createMany({ data: activity.map((item) => ({ ...item, userId: user.id })) });
  });
  revalidatePath("/", "layout");
}
