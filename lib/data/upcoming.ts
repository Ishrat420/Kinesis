import { connection } from "next/server";

import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { requireKinesisUser } from "@/lib/auth";
import { getExpiryReminderDate } from "@/lib/documents/expiry";

const DAY = 86_400_000;

export type UpcomingItem = {
  id: string;
  kind: "document" | "milestone" | "relationship";
  title: string;
  date: string;
  timestamp: number;
  href: string;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function getUpcomingAndDue(now = new Date()): Promise<UpcomingItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = startOfUtcDay(now);
  const [documents, milestones, importantDates, settings] = await Promise.all([
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
    getSettings(),
  ]);

  const documentItems = documents.flatMap((document): UpcomingItem[] => {
    const expiry = startOfUtcDay(document.expiryDate!);
    const reminderDate = getExpiryReminderDate(expiry, document.prompt);
    const expired = expiry < today;
    if (!expired && (!settings.remindersEnabled || today < reminderDate)) return [];
    return [{
      id: `document-${document.id}`,
      kind: "document",
      title: `${document.name} is ${expired ? "expired" : "expiring"}`,
      date: formatDate(expiry),
      timestamp: expiry.getTime(),
      href: `/documents/${document.id}`,
    }];
  });

  const milestoneItems = settings.remindersEnabled ? milestones.map((milestone): UpcomingItem => ({
    id: `milestone-${milestone.id}`,
    kind: "milestone",
    title: `${milestone.name} is over its due date`,
    date: formatDate(milestone.dueDate!),
    timestamp: milestone.dueDate!.getTime(),
    href: `/goals/${milestone.goalId}`,
  })) : [];

  const relationshipItems = importantDates.flatMap((importantDate): UpcomingItem[] => {
    if (!importantDate.relationship) return [];
    let occurrence = new Date(Date.UTC(today.getUTCFullYear(), importantDate.date.getUTCMonth(), importantDate.date.getUTCDate()));
    if (occurrence < today) occurrence = new Date(Date.UTC(today.getUTCFullYear() + 1, importantDate.date.getUTCMonth(), importantDate.date.getUTCDate()));
    if (occurrence.getTime() > today.getTime() + 31 * DAY) return [];
    const relationship = importantDate.relationship;
    const other = relationship.firstPerson.isSelf ? relationship.secondPerson : relationship.firstPerson;
    return [{ id: `relationship-${importantDate.id}`, kind: "relationship", title: `${other.name}${other.name.toLowerCase().endsWith("s") ? "'" : "'s"} ${importantDate.label} is coming`, date: formatDate(occurrence), timestamp: occurrence.getTime(), href: "/relationships" }];
  });
  return [...documentItems, ...milestoneItems, ...relationshipItems].sort((a, b) => a.timestamp - b.timestamp);
}
