import { connection } from "next/server";
import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { dismissalKey } from "@/lib/attention/dismissal";
import { OVERDUE_NOTIFICATION_TYPE } from "@/lib/notifications/identity";
import { getToday } from "@/lib/format/server";
import { getAttentionRecords, isOverdueForNeedsAttention, type NeedsAttentionEligible } from "./attention-items";

type BaseAttentionItem = { key: string; title: string; context: string; date: string; timestamp: number; href: string };
export type AttentionItem =
  | (BaseAttentionItem & { kind: "document"; editHref: string })
  | (BaseAttentionItem & { kind: "milestone"; goalId: string; milestoneId: string })
  /** A custom module object is shown with its own module's icon and colour. */
  | (BaseAttentionItem & { kind: "custom"; editHref: string; icon: string; color: string })
  /** A to-do carries its own id, like a milestone's, since it also gets Complete/Reschedule rather than Dismiss. */
  | (BaseAttentionItem & { kind: "todo"; todoId: string });

/**
 * Every key carries the deadline, and what is being said about it, that it
 * was built from -- so a dismissal recorded here stops matching the moment
 * either changes -- see lib/attention/dismissal.ts. Needs Attention only
 * ever shows the overdue phase, so that half is fixed per kind, the same
 * constant the bell itself resolves it from. A milestone and a to-do both
 * get the same shaped key for the React list alone; neither is dismissible,
 * and the server action rejects both.
 */
function toAttentionItem(record: NeedsAttentionEligible): AttentionItem {
  switch (record.kind) {
    case "document":
      return { key: dismissalKey("document", record.id, OVERDUE_NOTIFICATION_TYPE.document, record.expiryDate), kind: "document", title: record.name, context: "Expired document", date: record.expiryDate.toISOString(), timestamp: record.expiryDate.getTime(), href: `/documents/${record.id}`, editHref: `/documents/${record.id}?edit=1` };
    case "milestone":
      return { key: dismissalKey("milestone", record.id, "MILESTONE_DUE", record.dueDate), kind: "milestone", title: record.name, context: `Overdue milestone · ${record.goalName}`, date: record.dueDate.toISOString(), timestamp: record.dueDate.getTime(), href: `/goals/${record.goalId}`, goalId: record.goalId, milestoneId: record.id };
    case "custom":
      return { key: dismissalKey("custom", record.id, OVERDUE_NOTIFICATION_TYPE.custom, record.dueDate), kind: "custom", title: record.name, context: `Overdue · ${record.moduleName}`, date: record.dueDate.toISOString(), timestamp: record.dueDate.getTime(), href: `/custom-modules/${record.moduleId}/items/${record.id}`, editHref: `/custom-modules/${record.moduleId}/items/${record.id}`, icon: record.moduleIcon, color: record.moduleColor };
    case "todo":
      return { key: dismissalKey("todo", record.id, OVERDUE_NOTIFICATION_TYPE.todo, record.dueDate), kind: "todo", todoId: record.id, title: record.name, context: "Overdue to-do", date: record.dueDate.toISOString(), timestamp: record.dueDate.getTime(), href: "/todos" };
  }
}

/**
 * KD-017 Phase 2: sourced from the shared `getAttentionRecords` (Phase 1)
 * instead of its own four queries. Behaviour is unchanged except for the
 * Phase 0 bug fix that comes with it -- a milestone on a goal targeted for
 * today no longer depends on the time of day `now` happens to carry.
 */
export async function getNeedsAttention(now = new Date()): Promise<AttentionItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);
  const [records, dismissals] = await Promise.all([
    getAttentionRecords(now),
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));

  const items = records
    .filter((record): record is NeedsAttentionEligible => record.kind !== "relationship")
    .filter((record) => isOverdueForNeedsAttention(record, today))
    .map(toAttentionItem)
    .filter(({ key }) => !dismissed.has(key));

  return items.sort((a, b) => a.timestamp - b.timestamp);
}
