import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { isOpenTodoStatus } from "@/lib/todos/status";

export type AttentionItem = { key: string; kind: "document" | "milestone" | "custom" | "todo"; title: string; context: string; date: string; timestamp: number; href: string };

export async function getNeedsAttention(now = new Date()): Promise<AttentionItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = startOfUtcDay(now)!;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const [documents, milestones, customItems, todos, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { userId: user.id, expiryDate: { lt: today } }, select: { id: true, name: true, expiryDate: true } }),
    prisma.milestone.findMany({ where: { completed: false, dueDate: { lt: today }, goal: { userId: user.id, status: "Active" } }, select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } } }),
    prisma.customItem.findMany({ where: { archived: false, reminder: { lt: tomorrow }, module: { userId: user.id } }, select: { id: true, name: true, reminder: true, moduleId: true, module: { select: { name: true } } } }),
    // A To-Do without a due date is not overdue, it is just undated: capture
    // without a deadline is the point, so only dated ones can fall behind.
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { lt: today } }, select: { id: true, name: true, status: true, dueDate: true } }),
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  const items: AttentionItem[] = [
    ...documents.map((item) => ({ key: `document:${item.id}`, kind: "document" as const, title: item.name, context: "Expired document", date: item.expiryDate!.toISOString(), timestamp: item.expiryDate!.getTime(), href: `/documents/${item.id}` })),
    ...milestones.map((item) => ({ key: `milestone:${item.id}`, kind: "milestone" as const, title: item.name, context: `Overdue milestone · ${item.goal.name}`, date: item.dueDate!.toISOString(), timestamp: item.dueDate!.getTime(), href: `/goals/${item.goalId}` })),
    ...customItems.map((item) => ({ key: `custom:${item.id}`, kind: "custom" as const, title: item.name, context: `Reminder · ${item.module.name}`, date: item.reminder!.toISOString(), timestamp: item.reminder!.getTime(), href: `/custom-modules/${item.moduleId}/items/${item.id}` })),
    ...todos.filter((todo) => isOpenTodoStatus(todo.status)).map((todo) => ({ key: `todo:${todo.id}`, kind: "todo" as const, title: todo.name, context: "Overdue to-do", date: todo.dueDate!.toISOString(), timestamp: todo.dueDate!.getTime(), href: "/todos" })),
  ];
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));
  return items.filter(({ key }) => !dismissed.has(key)).sort((a, b) => a.timestamp - b.timestamp);
}
