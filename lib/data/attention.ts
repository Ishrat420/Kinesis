import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { dismissalKey } from "@/lib/attention/dismissal";
import { startOfUtcDay } from "@/lib/dates";
import { isOpenTodoStatus } from "@/lib/todos/status";

type BaseAttentionItem = { key: string; title: string; context: string; date: string; timestamp: number; href: string };
export type AttentionItem =
  | (BaseAttentionItem & { kind: "document"; editHref: string })
  | (BaseAttentionItem & { kind: "milestone"; goalId: string; milestoneId: string })
  | (BaseAttentionItem & { kind: "custom"; editHref: string })
  | (BaseAttentionItem & { kind: "todo" });

export async function getNeedsAttention(now = new Date()): Promise<AttentionItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = startOfUtcDay(now)!;
  const [documents, milestones, customItems, todos, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { userId: user.id, expiryDate: { lt: today } }, select: { id: true, name: true, expiryDate: true } }),
    prisma.milestone.findMany({ where: { completed: false, dueDate: { lt: today }, goal: { userId: user.id, status: "Active" } }, select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } } }),
    prisma.customItem.findMany({ where: { archived: false, dueDate: { lt: today }, module: { userId: user.id } }, select: { id: true, name: true, dueDate: true, moduleId: true, module: { select: { name: true } } } }),
    // A To-Do without a due date is not overdue, it is just undated: capture
    // without a deadline is the point, so only dated ones can fall behind.
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { lt: today } }, select: { id: true, name: true, status: true, dueDate: true } }),
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  // Every key carries the deadline it was built from, so a dismissal recorded
  // against one date stops matching the moment that date is edited -- see
  // lib/attention/dismissal.ts. A milestone gets the same shaped key for the
  // React list alone; it is not dismissible, and the server action rejects it.
  const items: AttentionItem[] = [
    ...documents.map((item) => ({ key: dismissalKey("document", item.id, item.expiryDate!), kind: "document" as const, title: item.name, context: "Expired document", date: item.expiryDate!.toISOString(), timestamp: item.expiryDate!.getTime(), href: `/documents/${item.id}`, editHref: `/documents/${item.id}?edit=1` })),
    ...milestones.map((item) => ({ key: dismissalKey("milestone", item.id, item.dueDate!), kind: "milestone" as const, title: item.name, context: `Overdue milestone · ${item.goal.name}`, date: item.dueDate!.toISOString(), timestamp: item.dueDate!.getTime(), href: `/goals/${item.goalId}`, goalId: item.goalId, milestoneId: item.id })),
    ...customItems.map((item) => ({ key: dismissalKey("custom", item.id, item.dueDate!), kind: "custom" as const, title: item.name, context: `Overdue · ${item.module.name}`, date: item.dueDate!.toISOString(), timestamp: item.dueDate!.getTime(), href: `/custom-modules/${item.moduleId}/items/${item.id}`, editHref: `/custom-modules/${item.moduleId}/items/${item.id}` })),
    ...todos.filter((todo) => isOpenTodoStatus(todo.status)).map((todo) => ({ key: dismissalKey("todo", todo.id, todo.dueDate!), kind: "todo" as const, title: todo.name, context: "Overdue to-do", date: todo.dueDate!.toISOString(), timestamp: todo.dueDate!.getTime(), href: "/todos" })),
  ];
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));
  return items.filter(({ key }) => !dismissed.has(key)).sort((a, b) => a.timestamp - b.timestamp);
}
