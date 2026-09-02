import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import { occurrencesForCadence } from "@/lib/calendar/recurrence";
import type { KinesisCalendarItem } from "@/lib/calendar/types";
import { prisma } from "./prisma";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const timeValue = (date: Date) => date.toISOString().slice(11, 16);
const hasTime = (date: Date) => date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;

export async function getCalendarItems(start: Date, end: Date): Promise<KinesisCalendarItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const reminderWindow = { where: { reminderAt: { gte: start, lte: end } }, select: { id: true, reminderAt: true, message: true } } as const;
  const [goals, documents, importantDates, practices, customItems] = await Promise.all([
    prisma.goal.findMany({ where: { userId: user.id }, include: { milestones: { include: { notifications: reminderWindow } } } }),
    prisma.document.findMany({ where: { userId: user.id }, select: { id: true, name: true, type: true, expiryDate: true, notifications: reminderWindow } }),
    prisma.relationshipImportantDate.findMany({ where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] }, include: { notifications: reminderWindow } }),
    prisma.connectionPractice.findMany({ where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] }, include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true } }),
    prisma.customItem.findMany({ where: { archived: false, module: { userId: user.id } }, include: { module: true, fields: true } }),
  ]);
  const items: KinesisCalendarItem[] = [];
  const add = (item: Omit<KinesisCalendarItem, "date"> & { date: Date }) => {
    if (item.date >= start && item.date <= end) items.push({ ...item, date: dateKey(item.date) });
  };

  for (const goal of goals) {
    if (goal.targetDate) add({ id: `goal-${goal.id}`, title: `${goal.name} target`, kind: "DATED", date: goal.targetDate, sourceType: "GOAL", sourceObjectId: goal.id, sourceModule: "Goals", href: `/goals/${goal.id}`, detail: "Goal target date" });
    for (const milestone of goal.milestones) {
      if (milestone.dueDate) add({ id: `milestone-${milestone.id}`, title: `${milestone.name} due`, kind: "DATED", date: milestone.dueDate, sourceType: "MILESTONE", sourceObjectId: goal.id, sourceModule: goal.name, href: `/goals/${goal.id}`, detail: milestone.completed ? "Completed milestone" : "Milestone due date" });
      for (const reminder of milestone.notifications) if (reminder.reminderAt) add({ id: `milestone-reminder-${reminder.id}`, title: reminder.message || `${milestone.name} reminder`, kind: hasTime(reminder.reminderAt) ? "SCHEDULED" : "DATED", date: reminder.reminderAt, startTime: hasTime(reminder.reminderAt) ? timeValue(reminder.reminderAt) : undefined, sourceType: "REMINDER", sourceObjectId: goal.id, sourceModule: goal.name, href: `/goals/${goal.id}`, detail: `Reminder for ${milestone.name}` });
    }
  }
  for (const document of documents) {
    if (document.expiryDate) add({ id: `document-${document.id}`, title: `${document.name} expires`, kind: "DATED", date: document.expiryDate, sourceType: "DOCUMENT", sourceObjectId: document.id, sourceModule: document.type, priority: "HIGH", href: `/documents/${document.id}`, detail: "Document expiry date" });
    for (const reminder of document.notifications) if (reminder.reminderAt) add({ id: `reminder-${reminder.id}`, title: reminder.message || `${document.name} reminder`, kind: hasTime(reminder.reminderAt) ? "SCHEDULED" : "DATED", date: reminder.reminderAt, startTime: hasTime(reminder.reminderAt) ? timeValue(reminder.reminderAt) : undefined, sourceType: "REMINDER", sourceObjectId: document.id, sourceModule: "Documents", href: `/documents/${document.id}`, detail: `Reminder for ${document.name}` });
  }
  for (const important of importantDates) {
    const occurrences = important.repeatsYearly
      ? Array.from({ length: end.getUTCFullYear() - start.getUTCFullYear() + 1 }, (_, offset) => new Date(Date.UTC(start.getUTCFullYear() + offset, important.date.getUTCMonth(), important.date.getUTCDate())))
      : [important.date];
    for (const occurrence of occurrences) add({ id: `relationship-date-${important.id}-${occurrence.getUTCFullYear()}`, title: important.label, kind: "DATED", date: occurrence, sourceType: "RELATIONSHIP", sourceObjectId: important.relationshipId || important.selfPersonId || important.id, sourceModule: "Relationships", recurring: important.repeatsYearly, href: "/relationships", detail: important.repeatsYearly ? "Repeats every year" : "Important relationship date" });
    for (const reminder of important.notifications) if (reminder.reminderAt) add({ id: `relationship-reminder-${reminder.id}`, title: reminder.message || `${important.label} reminder`, kind: hasTime(reminder.reminderAt) ? "SCHEDULED" : "DATED", date: reminder.reminderAt, startTime: hasTime(reminder.reminderAt) ? timeValue(reminder.reminderAt) : undefined, sourceType: "REMINDER", sourceObjectId: important.relationshipId || important.selfPersonId || important.id, sourceModule: "Relationships", href: "/relationships", detail: `Reminder for ${important.label}` });
  }
  for (const practice of practices) {
    const people = practice.relationship ? `${practice.relationship.firstPerson.name} & ${practice.relationship.secondPerson.name}` : practice.selfPerson?.name;
    for (const date of occurrencesForCadence(practice.cadence, practice.createdAt, start, end)) add({ id: `practice-${practice.id}-${dateKey(date)}`, title: practice.title, kind: "SCHEDULED", date, sourceType: "RELATIONSHIP", sourceObjectId: practice.relationshipId || practice.selfPersonId || practice.id, sourceModule: people || "Relationships", recurring: true, href: "/relationships", detail: practice.cadence || "Recurring relationship practice" });
  }
  for (const custom of customItems) {
    if (custom.reminder) add({ id: `custom-reminder-${custom.id}`, title: custom.name, kind: hasTime(custom.reminder) ? "SCHEDULED" : "DATED", date: custom.reminder, startTime: hasTime(custom.reminder) ? timeValue(custom.reminder) : undefined, sourceType: "CUSTOM_OBJECT", sourceObjectId: custom.id, sourceModule: custom.module.name, href: `/custom-modules/${custom.moduleId}`, detail: "Custom module reminder" });
    for (const field of custom.fields) if (/date|expiry|expires|due|reminder/i.test(field.label)) {
      const value = new Date(field.value);
      if (!Number.isNaN(value.getTime())) add({ id: `custom-field-${field.id}`, title: `${custom.name}: ${field.label}`, kind: "DATED", date: value, sourceType: "CUSTOM_OBJECT", sourceObjectId: custom.id, sourceModule: custom.module.name, href: `/custom-modules/${custom.moduleId}`, detail: `${field.label} from ${custom.module.name}` });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || "") || a.title.localeCompare(b.title));
}
