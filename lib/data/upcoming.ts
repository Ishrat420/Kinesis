import { connection } from "next/server";

import { prisma } from "./prisma";

const DAY = 86_400_000;

export type UpcomingItem = {
  id: string;
  kind: "document" | "milestone";
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
  const today = startOfUtcDay(now);
  const [documents, milestones] = await Promise.all([
    prisma.document.findMany({
      where: { expiryDate: { not: null } },
      select: { id: true, name: true, expiryDate: true, prompt: true },
    }),
    prisma.milestone.findMany({
      where: {
        completed: false,
        dueDate: { lt: today },
        goal: { status: "Active" },
      },
      select: { id: true, name: true, dueDate: true, goalId: true },
    }),
  ]);

  const documentItems = documents.flatMap((document): UpcomingItem[] => {
    const expiry = startOfUtcDay(document.expiryDate!);
    const reminderDate = new Date(expiry.getTime() - document.prompt * DAY);
    if (today < reminderDate) return [];
    const expired = expiry < today;
    return [{
      id: `document-${document.id}`,
      kind: "document",
      title: `${document.name} is ${expired ? "expired" : "expiring"}`,
      date: formatDate(expiry),
      timestamp: expiry.getTime(),
      href: `/documents/${document.id}`,
    }];
  });

  const milestoneItems = milestones.map((milestone): UpcomingItem => ({
    id: `milestone-${milestone.id}`,
    kind: "milestone",
    title: `${milestone.name} is over its due date`,
    date: formatDate(milestone.dueDate!),
    timestamp: milestone.dueDate!.getTime(),
    href: `/goals/${milestone.goalId}`,
  }));

  return [...documentItems, ...milestoneItems].sort((a, b) => a.timestamp - b.timestamp);
}
