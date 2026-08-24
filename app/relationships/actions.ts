"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import type { RelationshipMapData } from "@/lib/relationships";

export async function saveRelationshipMap(data: RelationshipMapData) {
  await prisma.$transaction(async (tx) => {
    await tx.relationship.deleteMany();
    await tx.person.deleteMany();
    for (const person of data.people) await tx.person.create({ data: { id: person.id, name: person.name, category: person.detail === "You" ? null : person.detail, isSelf: person.detail === "You", positionX: person.x, positionY: person.y, bubbleSize: person.size, color: person.color, icon: person.icon } });
    for (const relationship of data.relationships) await tx.relationship.create({ data: { id: relationship.id, firstPersonId: relationship.from, secondPersonId: relationship.to, type: relationship.type, notes: relationship.notes || null, practices: { create: relationship.practices.map((practice, position) => ({ id: crypto.randomUUID(), ...practice, position })) }, reflections: { create: relationship.reflections.map((reflection) => ({ id: crypto.randomUUID(), text: reflection.text, reflectedAt: new Date(`${reflection.date}T00:00:00.000Z`) })) }, importantDates: { create: relationship.importantDates.map((date) => ({ id: crypto.randomUUID(), label: date.label, date: new Date(`${date.date}T00:00:00.000Z`) })) }, linkedGoals: { create: relationship.linkedGoals.map((goalId) => ({ goalId })) } } });
  });
  revalidatePath("/", "layout");
}
