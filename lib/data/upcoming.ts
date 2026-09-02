import { connection } from "next/server";

import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { requireKinesisUser } from "@/lib/auth";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { startOfUtcDay } from "@/lib/dates";
import { isOpenTodoStatus } from "@/lib/todos/status";

const DAY = 86_400_000;

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
  const [documents, milestones, importantDates, todos, settings] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, expiryDate: { not: null } },
      select: { id: true, name: true, expiryDate: true, prompt: true },
    }),
    prisma.milestone.findMany({
      where: {
        completed: false,
        dueDate: { lt: today },
        goal: { userId: user.id, status: "Active" },
      },
      select: { id: true, name: true, dueDate: true, goalId: true },
    }),
    prisma.relationshipImportantDate.findMany({ where: { relationship: { userId: user.id } }, include: { relationship: { include: { firstPerson: true, secondPerson: true } } } }),
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { not: null } }, select: { id: true, name: true, status: true, dueDate: true } }),
    getSettings(),
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

  const milestoneItems = settings.remindersEnabled ? milestones.map((milestone): UpcomingItem => ({
    id: `milestone-${milestone.id}`,
    kind: "milestone",
    title: `${milestone.name} is over its due date`,
    date: milestone.dueDate!.toISOString(),
    timestamp: milestone.dueDate!.getTime(),
    href: `/goals/${milestone.goalId}`,
  })) : [];

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

  const relationshipItems = importantDates.flatMap((importantDate): UpcomingItem[] => {
    if (!importantDate.relationship) return [];
    let occurrence = new Date(Date.UTC(today.getUTCFullYear(), importantDate.date.getUTCMonth(), importantDate.date.getUTCDate()));
    if (occurrence < today) occurrence = new Date(Date.UTC(today.getUTCFullYear() + 1, importantDate.date.getUTCMonth(), importantDate.date.getUTCDate()));
    if (occurrence.getTime() > today.getTime() + 31 * DAY) return [];
    const relationship = importantDate.relationship;
    const other = relationship.firstPerson.isSelf ? relationship.secondPerson : relationship.firstPerson;
    return [{ id: `relationship-${importantDate.id}`, kind: "relationship", title: `${other.name}${other.name.toLowerCase().endsWith("s") ? "'" : "'s"} ${importantDate.label} is coming`, date: occurrence.toISOString(), timestamp: occurrence.getTime(), href: "/relationships" }];
  });
  return [...documentItems, ...milestoneItems, ...todoItems, ...relationshipItems].sort((a, b) => a.timestamp - b.timestamp);
}
