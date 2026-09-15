import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { dismissalKey } from "@/lib/attention/dismissal";
import { OVERDUE_NOTIFICATION_TYPE } from "@/lib/notifications/identity";
import { getToday } from "@/lib/format/server";
import { activeGoalWhere } from "@/lib/goals/active";
import { isOpenTodoStatus } from "@/lib/todos/status";

type BaseAttentionItem = { key: string; title: string; context: string; date: string; timestamp: number; href: string };
export type AttentionItem =
  | (BaseAttentionItem & { kind: "document"; editHref: string })
  | (BaseAttentionItem & { kind: "milestone"; goalId: string; milestoneId: string })
  /** A custom module object is shown with its own module's icon and colour. */
  | (BaseAttentionItem & { kind: "custom"; editHref: string; icon: string; color: string })
  /** A to-do carries its own id, like a milestone's, since it also gets Complete/Reschedule rather than Dismiss. */
  | (BaseAttentionItem & { kind: "todo"; todoId: string });

export async function getNeedsAttention(now = new Date()): Promise<AttentionItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);
  const [documents, milestones, customItems, todos, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { userId: user.id, archived: false, expiryDate: { lt: today } }, select: { id: true, name: true, expiryDate: true } }),
    prisma.milestone.findMany({ where: { completed: false, dueDate: { lt: today }, goal: { userId: user.id, ...activeGoalWhere(now) } }, select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } } }),
    prisma.customItem.findMany({ where: { archived: false, dueDate: { lt: today }, module: { userId: user.id } }, select: { id: true, name: true, dueDate: true, moduleId: true, module: { select: { name: true, icon: true, color: true } } } }),
    // A To-Do without a due date is not overdue, it is just undated: capture
    // without a deadline is the point, so only dated ones can fall behind.
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { lt: today } }, select: { id: true, name: true, status: true, dueDate: true } }),
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  // Every key carries the deadline, and what is being said about it, that it
  // was built from -- so a dismissal recorded here stops matching the moment
  // either changes -- see lib/attention/dismissal.ts. Needs Attention only
  // ever shows the overdue phase, so that half is fixed per kind, the same
  // constant the bell itself resolves it from. A milestone and a to-do both
  // get the same shaped key for the React list alone; neither is dismissible,
  // and the server action rejects both.
  const items: AttentionItem[] = [
    ...documents.map((item) => ({ key: dismissalKey("document", item.id, OVERDUE_NOTIFICATION_TYPE.document, item.expiryDate!), kind: "document" as const, title: item.name, context: "Expired document", date: item.expiryDate!.toISOString(), timestamp: item.expiryDate!.getTime(), href: `/documents/${item.id}`, editHref: `/documents/${item.id}?edit=1` })),
    ...milestones.map((item) => ({ key: dismissalKey("milestone", item.id, "MILESTONE_DUE", item.dueDate!), kind: "milestone" as const, title: item.name, context: `Overdue milestone · ${item.goal.name}`, date: item.dueDate!.toISOString(), timestamp: item.dueDate!.getTime(), href: `/goals/${item.goalId}`, goalId: item.goalId, milestoneId: item.id })),
    ...customItems.map((item) => ({ key: dismissalKey("custom", item.id, OVERDUE_NOTIFICATION_TYPE.custom, item.dueDate!), kind: "custom" as const, title: item.name, context: `Overdue · ${item.module.name}`, date: item.dueDate!.toISOString(), timestamp: item.dueDate!.getTime(), href: `/custom-modules/${item.moduleId}/items/${item.id}`, editHref: `/custom-modules/${item.moduleId}/items/${item.id}`, icon: item.module.icon, color: item.module.color })),
    ...todos.filter((todo) => isOpenTodoStatus(todo.status)).map((todo) => ({ key: dismissalKey("todo", todo.id, OVERDUE_NOTIFICATION_TYPE.todo, todo.dueDate!), kind: "todo" as const, todoId: todo.id, title: todo.name, context: "Overdue to-do", date: todo.dueDate!.toISOString(), timestamp: todo.dueDate!.getTime(), href: "/todos" })),
  ];
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));
  return items.filter(({ key }) => !dismissed.has(key)).sort((a, b) => a.timestamp - b.timestamp);
}
