import { connection } from "next/server";

import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { requireKinesisUser } from "@/lib/auth";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { startOfUtcDay } from "@/lib/dates";
import { getReminderLeadDays, getReminderWindowEnd } from "@/lib/reminders/policy";
import { getNextOccurrence, possessiveName } from "@/lib/relationships/occurrence";
import { isOpenTodoStatus } from "@/lib/todos/status";

export type UpcomingItem = {
  id: string;
  kind: "document" | "milestone" | "relationship" | "todo";
  title: string;
  date: string;
  timestamp: number;
  href: string;
};

export async function getUpcomingAndDue(now = new Date()): Promise<UpcomingItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = startOfUtcDay(now)!;
  const settings = await getSettings();
  const milestoneWindowEnd = getReminderWindowEnd(today, getReminderLeadDays(settings, "milestone"));
  const relationshipLeadDays = getReminderLeadDays(settings, "relationship");
  const [documents, milestones, importantDates, todos] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, expiryDate: { not: null } },
      select: { id: true, name: true, expiryDate: true, prompt: true },
    }),
    prisma.milestone.findMany({
      where: {
        completed: false,
        // The upper bound is moot once mapped below when reminders are off, but
        // narrowing here keeps the query from fetching every future milestone.
        dueDate: { lte: milestoneWindowEnd },
        goal: { userId: user.id, status: "Active" },
      },
      select: { id: true, name: true, dueDate: true, goalId: true },
    }),
    prisma.relationshipImportantDate.findMany({
      where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] },
      include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true },
    }),
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { not: null } }, select: { id: true, name: true, status: true, dueDate: true } }),
  ]);

  const documentItems = documents.flatMap((document): UpcomingItem[] => {
    const expiry = startOfUtcDay(document.expiryDate!)!;
    const reminderDate = getExpiryReminderDate(expiry, document.prompt);
    const expired = expiry < today;
    if (!expired && (!settings.remindersEnabled || today < reminderDate)) return [];
    return [{
      id: `document-${document.id}`,
      kind: "document",
      title: `${document.name} is ${expired ? "expired" : "expiring"}`,
      date: expiry.toISOString(),
      timestamp: expiry.getTime(),
      href: `/documents/${document.id}`,
    }];
  });

  const milestoneItems = settings.remindersEnabled ? milestones.map((milestone): UpcomingItem => {
    const dueDate = startOfUtcDay(milestone.dueDate!)!;
    return {
      id: `milestone-${milestone.id}`,
      kind: "milestone",
      title: `${milestone.name} is ${dueDate < today ? "over its due date" : "due soon"}`,
      date: dueDate.toISOString(),
      timestamp: dueDate.getTime(),
      href: `/goals/${milestone.goalId}`,
    };
  }) : [];

  /**
   * A dated To-Do appears here once it is due or overdue. Undated captures never
   * do: the point of ADR-009 is that recording something must not require a
   * deadline, so inventing one to make it visible would defeat the feature.
   */
  const todoItems = todos.flatMap((todo): UpcomingItem[] => {
    const due = startOfUtcDay(todo.dueDate!)!;
    if (!isOpenTodoStatus(todo.status) || due > today) return [];
    return [{ id: `todo-${todo.id}`, kind: "todo", title: `${todo.name} is due`, date: due.toISOString(), timestamp: due.getTime(), href: "/todos" }];
  });

  const relationshipWindowEnd = getReminderWindowEnd(today, relationshipLeadDays);
  const relationshipItems = settings.remindersEnabled ? importantDates.flatMap((importantDate): UpcomingItem[] => {
    const occurrence = getNextOccurrence(importantDate, today);
    if (!occurrence || occurrence.getTime() > relationshipWindowEnd.getTime()) return [];
    const personName = importantDate.relationship
      ? (importantDate.relationship.firstPerson.isSelf ? importantDate.relationship.secondPerson.name : importantDate.relationship.firstPerson.name)
      : importantDate.selfPerson!.name;
    return [{ id: `relationship-${importantDate.id}`, kind: "relationship", title: `${possessiveName(personName)} ${importantDate.label} is coming`, date: occurrence.toISOString(), timestamp: occurrence.getTime(), href: "/relationships" }];
  }) : [];
  return [...documentItems, ...milestoneItems, ...todoItems, ...relationshipItems].sort((a, b) => a.timestamp - b.timestamp);
}
