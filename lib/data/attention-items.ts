import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { getUserDisplayName } from "./user";
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
  goalUpcomingPhase,
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
 * Due, by kind) per ADR-010, nor by any date at all: every remaining
 * structural exclusion here is boolean (archived, completed, closed) or the
 * stored status column (`activeGoalWhere`, KD-028), so there is no `today`
 * for this function itself to resolve or be given. Each caller still
 * resolves its own `today` separately, for the date-based phase functions
 * (`lib/attention/items.ts`) it runs over these records afterwards.
 *
 * `scope` is an escape hatch for `collectNotifications`
 * (`lib/data/notification-collection.ts`), the one caller that takes
 * `userId` as an explicit argument rather than resolving it from the
 * ambient session -- passing it through here preserves that; every other
 * caller omits `scope` and gets the ordinary session-bound
 * `requireKinesisUser` instead.
 */
export async function getAttentionRecords(scope?: { userId: string }): Promise<AttentionRecord[]> {
  await connection();
  const userId = scope?.userId ?? (await requireKinesisUser()).id;

  const [documents, milestones, customItems, todos, importantDates, goals, selfUser] = await Promise.all([
    prisma.document.findMany({
      where: { userId, archived: false, expiryDate: { not: null } },
      select: { id: true, name: true, type: true, expiryDate: true, prompt: true },
    }),
    prisma.milestone.findMany({
      where: { completed: false, dueDate: { not: null }, goal: { userId, ...activeGoalWhere() } },
      select: { id: true, name: true, dueDate: true, goalId: true, goal: { select: { name: true } } },
    }),
    prisma.customItem.findMany({
      where: { archived: false, dueDate: { not: null }, module: { userId } },
      select: { id: true, name: true, dueDate: true, moduleId: true, module: { select: { name: true, icon: true, color: true } } },
    }),
    // A To-Do without a due date is just undated, not overdue -- capture
    // without a deadline is the point (ADR-009) -- so it never appears here.
    prisma.todo.findMany({
      where: { userId, dueDate: { not: null } },
      select: { id: true, name: true, dueDate: true, status: true },
    }),
    prisma.relationshipImportantDate.findMany({
      where: { OR: [{ relationship: { userId } }, { selfPerson: { userId } }] },
      include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true },
    }),
    // `activeGoalWhere` would also match here (it's exactly `status: "Active"`
    // now, KD-028) -- spelled out rather than reused because this query cares
    // specifically about the status column a goal's own actions write to,
    // not "whatever activeGoalWhere happens to mean" if that ever changes.
    prisma.goal.findMany({
      where: { userId, status: "Active", targetDate: { not: null } },
      select: { id: true, name: true, targetDate: true },
    }),
    // Only needed to credit the account owner by name in a shared important
    // date's reminder ("Alex and Karen's Anniversary") rather than their
    // Person record's own, separately-editable `name` -- see `pairedWithName`
    // below. One indexed lookup, run alongside everything else here rather
    // than only when an importantDate actually needs it, since needing it is
    // the common case for anyone who tracks a spouse or partner.
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, preferredName: true } }),
  ]);
  const selfDisplayName = selfUser ? getUserDisplayName(selfUser) : null;

  return [
    ...documents.map((document): AttentionRecord => ({ kind: "document", id: document.id, name: document.name, type: document.type, expiryDate: document.expiryDate!, prompt: document.prompt })),
    ...milestones.map((milestone): AttentionRecord => ({ kind: "milestone", id: milestone.id, name: milestone.name, dueDate: milestone.dueDate!, goalId: milestone.goalId, goalName: milestone.goal.name })),
    ...customItems.map((item): AttentionRecord => ({ kind: "custom", id: item.id, name: item.name, dueDate: item.dueDate!, moduleId: item.moduleId, moduleName: item.module.name, moduleIcon: item.module.icon, moduleColor: item.module.color })),
    ...todos.filter((todo) => isOpenTodoStatus(todo.status)).map((todo): AttentionRecord => ({ kind: "todo", id: todo.id, name: todo.name, dueDate: todo.dueDate! })),
    ...importantDates.map((importantDate): AttentionRecord => {
      // The "other" person a date is about, whether it comes from a two-person
      // relationship or the self-person's own calendar -- the same person a
      // to-do created from this date should link to (see KD-047).
      const relationship = importantDate.relationship;
      const person = relationship
        ? (relationship.firstPerson.isSelf ? relationship.secondPerson : relationship.firstPerson)
        : importantDate.selfPerson!;
      // Set only when this date came from a Relationship's own "Shared
      // Important Dates" (not a single Person's page): the pair's other
      // member, so an Anniversary can credit both people instead of reading
      // as though it belongs to `person` alone. `selfDisplayName` over the
      // owner's own Person.name for the same reason search results do
      // (lib/search/providers.ts) -- that name is independently editable and
      // can drift from what the owner is actually called.
      const partner = relationship ? (person.id === relationship.firstPerson.id ? relationship.secondPerson : relationship.firstPerson) : null;
      const pairedWithName = partner ? (partner.isSelf ? selfDisplayName ?? partner.name : partner.name) : null;
      return {
        kind: "relationship",
        id: importantDate.id,
        label: importantDate.label,
        date: importantDate.date,
        repeatsYearly: importantDate.repeatsYearly,
        personName: person.name,
        personObjectId: person.objectId,
        pairedWithName,
      };
    }),
    ...goals.map((goal): AttentionRecord => ({ kind: "goal", id: goal.id, name: goal.name, targetDate: goal.targetDate! })),
  ];
}
