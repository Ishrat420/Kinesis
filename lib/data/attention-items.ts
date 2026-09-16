import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { getToday } from "@/lib/format/server";
import { activeGoalWhere } from "@/lib/goals/active";
import { isOpenTodoStatus } from "@/lib/todos/status";
import type { AttentionRecord } from "@/lib/attention/items";

export type { AttentionRecord, NeedsAttentionEligible, UpcomingPhase } from "@/lib/attention/items";
export {
  isOverdueForNeedsAttention,
  documentUpcomingPhase,
  milestoneUpcomingPhase,
  customItemUpcomingPhase,
  todoUpcomingPhase,
  relationshipUpcomingPhase,
} from "@/lib/attention/items";

/**
 * KD-017 Step One, Phase 1: the one query each record kind needs, instead of
 * the five independent ones `getNeedsAttention`, `getUpcomingAndDue`,
 * `collectNotifications`, `getExpiringDocuments` and `getMilestonesDueSoon`
 * currently run separately.
 *
 * Only *structural* exclusions are applied here -- archived, completed,
 * closed, undated, the parent goal no longer active. Nothing here decides
 * overdue/due-soon/fine; that's `lib/attention/items.ts`, one status
 * function per surface, each cited to the ADR-010 line it implements. See
 * that file for why a single precomputed status here would be wrong.
 *
 * Nothing in this file is wired to a real consumer yet -- see KD-017's
 * Phase 2/3 for that. `getNeedsAttention`, `getUpcomingAndDue` and
 * `collectNotifications` are unchanged and still the ones actually feeding
 * the dashboard.
 */

/**
 * Every record any awareness surface could show, with only structural
 * exclusions applied -- not filtered by any reminder window or
 * `remindersEnabled`, both of which vary by surface (and, for Upcoming &
 * Due, by kind) per ADR-010.
 *
 * Fixes two bugs the five existing implementations have between them
 * (KD-017 Phase 0): `activeGoalWhere` is always given the precomputed
 * `today`, never the raw, time-of-day-bearing `now` (`getNeedsAttention`
 * and `getUpcomingAndDue` currently pass `now`, which can drop a goal
 * targeted for today for part of the day); and `today` itself is always
 * the one shared, `getFormatPreferences`-cached call, never a second,
 * separately-implemented resolution of the same value.
 */
export async function getAttentionRecords(now = new Date()): Promise<AttentionRecord[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);

  const [documents, milestones, customItems, todos, importantDates] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, archived: false, expiryDate: { not: null } },
      select: { id: true, name: true, expiryDate: true, prompt: true },
    }),
    prisma.milestone.findMany({
      where: { completed: false, dueDate: { not: null }, goal: { userId: user.id, ...activeGoalWhere(today) } },
      select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } },
    }),
    prisma.customItem.findMany({
      where: { archived: false, dueDate: { not: null }, module: { userId: user.id } },
      select: { id: true, name: true, dueDate: true, moduleId: true, module: { select: { name: true, icon: true, color: true } } },
    }),
    // A To-Do without a due date is just undated, not overdue -- capture
    // without a deadline is the point (ADR-009) -- so it never appears here.
    prisma.todo.findMany({
      where: { userId: user.id, dueDate: { not: null } },
      select: { id: true, name: true, dueDate: true, status: true },
    }),
    prisma.relationshipImportantDate.findMany({
      where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] },
      include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true },
    }),
  ]);

  return [
    ...documents.map((document): AttentionRecord => ({ kind: "document", id: document.id, name: document.name, expiryDate: document.expiryDate!, prompt: document.prompt })),
    ...milestones.map((milestone): AttentionRecord => ({ kind: "milestone", id: milestone.id, name: milestone.name, dueDate: milestone.dueDate!, goalId: milestone.goalId, goalName: milestone.goal.name })),
    ...customItems.map((item): AttentionRecord => ({ kind: "custom", id: item.id, name: item.name, dueDate: item.dueDate!, moduleId: item.moduleId, moduleName: item.module.name, moduleIcon: item.module.icon, moduleColor: item.module.color })),
    ...todos.filter((todo) => isOpenTodoStatus(todo.status)).map((todo): AttentionRecord => ({ kind: "todo", id: todo.id, name: todo.name, dueDate: todo.dueDate! })),
    ...importantDates.map((importantDate): AttentionRecord => ({
      kind: "relationship",
      id: importantDate.id,
      label: importantDate.label,
      date: importantDate.date,
      repeatsYearly: importantDate.repeatsYearly,
      personName: importantDate.relationship
        ? (importantDate.relationship.firstPerson.isSelf ? importantDate.relationship.secondPerson.name : importantDate.relationship.firstPerson.name)
        : importantDate.selfPerson!.name,
    })),
  ];
}
