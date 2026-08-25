import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";

export type AttentionItem = { key: string; kind: "document" | "milestone" | "custom"; title: string; context: string; date: string; timestamp: number; href: string };
const startOfUtcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const formatDate = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function getNeedsAttention(now = new Date()): Promise<AttentionItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const [documents, milestones, customItems, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { userId: user.id, expiryDate: { lt: today } }, select: { id: true, name: true, expiryDate: true } }),
    prisma.milestone.findMany({ where: { completed: false, dueDate: { lt: today }, goal: { userId: user.id, status: "Active" } }, select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } } }),
    prisma.customItem.findMany({ where: { archived: false, reminder: { lt: tomorrow }, module: { userId: user.id } }, select: { id: true, name: true, reminder: true, moduleId: true, module: { select: { name: true } } } }),
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  const items: AttentionItem[] = [
    ...documents.map((item) => ({ key: `document:${item.id}`, kind: "document" as const, title: item.name, context: "Expired document", date: formatDate(item.expiryDate!), timestamp: item.expiryDate!.getTime(), href: `/documents/${item.id}` })),
    ...milestones.map((item) => ({ key: `milestone:${item.id}`, kind: "milestone" as const, title: item.name, context: `Overdue milestone · ${item.goal.name}`, date: formatDate(item.dueDate!), timestamp: item.dueDate!.getTime(), href: `/goals/${item.goalId}` })),
    ...customItems.map((item) => ({ key: `custom:${item.id}`, kind: "custom" as const, title: item.name, context: `Reminder · ${item.module.name}`, date: formatDate(item.reminder!), timestamp: item.reminder!.getTime(), href: `/custom-modules/${item.moduleId}/items/${item.id}` })),
  ];
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));
  return items.filter(({ key }) => !dismissed.has(key)).sort((a, b) => a.timestamp - b.timestamp);
}
