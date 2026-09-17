import { cache } from "react";
import { connection } from "next/server";

import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { requireKinesisUser } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getToday } from "@/lib/format/server";
import { getReminderLeadDays } from "@/lib/reminders/policy";
import { getNextOccurrence, possessiveName } from "@/lib/relationships/occurrence";
import { dismissalKey } from "@/lib/attention/dismissal";
import { OVERDUE_NOTIFICATION_TYPE } from "@/lib/notifications/identity";
import {
  getAttentionRecords,
  documentUpcomingPhase,
  milestoneUpcomingPhase,
  customItemUpcomingPhase,
  todoUpcomingPhase,
  relationshipUpcomingPhase,
  type AttentionRecord,
} from "./attention-items";

type BaseUpcomingItem = { id: string; title: string; date: string; timestamp: number; href: string };
export type UpcomingItem =
  /** `dismissKey` is the same key Needs Attention dismisses this exact record/deadline under -- see lib/attention/dismissal.ts. Dismissing here hides it there too, for free, since both read the one AttentionDismissal table. */
  | (BaseUpcomingItem & { kind: "document"; editHref: string; dismissKey: string })
  | (BaseUpcomingItem & { kind: "milestone"; goalId: string; milestoneId: string })
  | (BaseUpcomingItem & { kind: "relationship" })
  | (BaseUpcomingItem & { kind: "todo"; todoId: string })
  /** A custom module object is shown with its own module's icon and colour. */
  | (BaseUpcomingItem & { kind: "custom"; icon: string; color: string; editHref: string; dismissKey: string });

function toUpcomingItem(record: AttentionRecord, today: Date, dismissed: ReadonlySet<string>, leadDays: { milestone: number; relationship: number; customItem: number; todo: number }, remindersEnabled: boolean): UpcomingItem | null {
  switch (record.kind) {
    case "document": {
      const phase = documentUpcomingPhase(record, today, remindersEnabled);
      if (!phase) return null;
      const expiry = startOfUtcDay(record.expiryDate)!;
      const expired = phase === "overdue";
      // The advance notice and the overdue notice are different things to have
      // dismissed, even at the same deadline -- see lib/attention/dismissal.ts.
      // Dismissing one while "expiring soon" must not pre-empt the other, once
      // this document actually expires.
      const dismissKey = dismissalKey("document", record.id, expired ? OVERDUE_NOTIFICATION_TYPE.document : "REMINDER_DUE", expiry);
      if (dismissed.has(dismissKey)) return null;
      return { id: `document-${record.id}`, kind: "document", title: `${record.name} is ${expired ? "expired" : "expiring"}`, date: expiry.toISOString(), timestamp: expiry.getTime(), href: `/documents/${record.id}`, editHref: `/documents/${record.id}?edit=1`, dismissKey };
    }
    case "milestone": {
      const phase = milestoneUpcomingPhase(record, today, leadDays.milestone, remindersEnabled);
      if (!phase) return null;
      const dueDate = startOfUtcDay(record.dueDate)!;
      return { id: `milestone-${record.id}`, kind: "milestone", title: `${record.name} is ${phase === "overdue" ? "over its due date" : "due soon"}`, date: dueDate.toISOString(), timestamp: dueDate.getTime(), href: `/goals/${record.goalId}`, goalId: record.goalId, milestoneId: record.id };
    }
    case "todo": {
      const phase = todoUpcomingPhase(record, today, leadDays.todo, remindersEnabled);
      if (!phase) return null;
      const due = startOfUtcDay(record.dueDate)!;
      return { id: `todo-${record.id}`, kind: "todo", todoId: record.id, title: `${record.name} is ${phase === "due-soon" ? "due soon" : "due"}`, date: due.toISOString(), timestamp: due.getTime(), href: "/todos" };
    }
    case "relationship": {
      const phase = relationshipUpcomingPhase(record, today, leadDays.relationship, remindersEnabled);
      if (!phase) return null;
      const occurrence = getNextOccurrence(record, today)!;
      return { id: `relationship-${record.id}`, kind: "relationship", title: `${possessiveName(record.personName)} ${record.label} is coming`, date: occurrence.toISOString(), timestamp: occurrence.getTime(), href: "/relationships" };
    }
    case "custom": {
      const phase = customItemUpcomingPhase(record, today, leadDays.customItem, remindersEnabled);
      if (!phase) return null;
      const dueDate = startOfUtcDay(record.dueDate)!;
      const overdue = phase === "overdue";
      // Same reasoning as a document's dismissal key, above: "due soon" and
      // "over its due date" are dismissed independently, even at one deadline.
      const dismissKey = dismissalKey("custom", record.id, overdue ? OVERDUE_NOTIFICATION_TYPE.custom : "REMINDER_DUE", dueDate);
      if (dismissed.has(dismissKey)) return null;
      return { id: `custom-${record.id}`, kind: "custom", title: `${record.name} is ${overdue ? "over its due date" : "due soon"}`, date: dueDate.toISOString(), timestamp: dueDate.getTime(), href: `/custom-modules/${record.moduleId}/items/${record.id}`, editHref: `/custom-modules/${record.moduleId}/items/${record.id}`, icon: record.moduleIcon, color: record.moduleColor, dismissKey };
    }
  }
}

/**
 * KD-017 Phase 2: sourced from the shared `getAttentionRecords` (Phase 1)
 * instead of its own five queries, using the corrected per-kind phase rules
 * (KD-017 Phase 0's ADR-010 reconciliation) -- most visibly, an overdue
 * milestone or custom item no longer disappears when `remindersEnabled` is
 * off, which it incorrectly did before.
 *
 * `cache()`-wrapped because `app/(app)/page.tsx` and
 * `components/dashboard/ModuleGrid.tsx` both call this, independently, on
 * the same dashboard render -- previously two full round-trips for the same
 * answer. Both call it with no arguments, so this also collapses the two
 * calls' own `now` defaults into the one `Date` the cache is keyed on.
 */
export const getUpcomingAndDue = cache(async function getUpcomingAndDue(now = new Date()): Promise<UpcomingItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);
  const settings = await getSettings();
  const leadDays = {
    milestone: getReminderLeadDays(settings, "milestone"),
    relationship: getReminderLeadDays(settings, "relationship"),
    customItem: getReminderLeadDays(settings, "customItem"),
    todo: getReminderLeadDays(settings, "todo"),
  };

  const [records, dismissals] = await Promise.all([
    getAttentionRecords(now),
    // Shared with Needs Attention (lib/data/attention.ts), keyed the same way
    // -- one dismissal hides a record's row on both surfaces at once.
    prisma.attentionDismissal.findMany({ where: { userId: user.id }, select: { itemKey: true } }),
  ]);
  const dismissed = new Set(dismissals.map(({ itemKey }) => itemKey));

  const items = records
    .map((record) => toUpcomingItem(record, today, dismissed, leadDays, settings.remindersEnabled))
    .filter((item): item is UpcomingItem => item !== null);

  // `id` breaks a same-day tie deterministically -- relying on array order to
  // do it, as this used to, broke silently the moment records started coming
  // from one shared array (getAttentionRecords) instead of five separately
  // concatenated ones: two items due on the exact same day (common, not an
  // edge case) could swap which showed first purely because the shared
  // array happens to list custom items before to-dos, where the old code's
  // own concatenation listed them the other way around.
  return items.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
});
