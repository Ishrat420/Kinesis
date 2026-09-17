import { prisma } from "./prisma";
import {
  getDocumentNotificationCandidate,
  getMilestoneNotificationCandidate,
  getRelationshipDateNotificationCandidate,
  getCustomItemNotificationCandidate,
  getTodoNotificationCandidate,
  toDerivedNotification,
  byRecency,
  type DerivedNotification,
} from "@/lib/notifications/engine";
import { getReminderLeadDays } from "@/lib/reminders/policy";
import { resolveFormatPreferences } from "@/lib/format/preferences";
import { startOfDayIn } from "@/lib/dates";
import { getAttentionRecords } from "./attention-items";

/**
 * Every notification the owner should currently see, computed rather than
 * stored. Nothing is written here: the candidates are a pure function of
 * the records, the day and the settings, and the only thing read that is
 * not derivable is which of them have already been read.
 *
 * KD-017 Phase 3: records come from the shared `getAttentionRecords`
 * (Phase 1) instead of five queries of this function's own -- it stops
 * being a sixth, separately-maintained implementation of "what's due."
 * Only which rows feed the candidate builders (`lib/notifications/engine.ts`)
 * changes; their type derivation, `notificationKey`'s identity, and the
 * `NotificationRead` dedup table below are untouched, since a changed key
 * would silently un-read something a real user already saw.
 *
 * Kept in its own file, separate from `lib/data/notifications.ts` (which
 * calls it): that file's `getRecentNotifications`/`markAllNotificationsRead`
 * are unit-tested by mocking this function away as an external dependency
 * (see `tests/unit/notifications-bell-gate.test.ts`), which only works
 * across a real module boundary -- a same-file mock can't intercept another
 * function in that same file calling it directly.
 *
 * Also why this isn't in `lib/notifications/engine.ts` alongside the
 * candidate builders it calls: `getAttentionRecords` reaches
 * `requireKinesisUser`/`next/server`, and pulling that into `engine.ts`
 * would have made every one of its pure candidate-builder functions
 * un-importable from a test (or anywhere else) that doesn't stub those out.
 *
 * Explicitly scoped to the given `userId` throughout -- unlike every other
 * caller of `getAttentionRecords`, this one does not assume "the current
 * session" (see `getAttentionRecords`'s `scope` parameter), which is also
 * why `today` is resolved from this user's own settings directly rather
 * than through the session-bound `getToday()`.
 *
 * One behaviour fix comes with the migration: `getMilestoneNotificationCandidate`
 * and `getCustomItemNotificationCandidate` now gate `remindersEnabled`
 * internally (KD-017 Phase 0/3), so `MILESTONE_DUE`/`CUSTOM_ITEM_DUE` survive
 * the switch being off, matching ADR-010, instead of disappearing along with
 * their advance `REMINDER_DUE` phase the way the old external gate did.
 */
export async function collectNotifications(userId: string, now = new Date()): Promise<DerivedNotification[]> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const remindersEnabled = settings?.remindersEnabled ?? true;
  const milestoneLeadDays = getReminderLeadDays(settings, "milestone");
  const relationshipLeadDays = getReminderLeadDays(settings, "relationship");
  const customItemLeadDays = getReminderLeadDays(settings, "customItem");
  const todoLeadDays = getReminderLeadDays(settings, "todo");
  const { locale, timeZone } = resolveFormatPreferences(settings);
  const today = startOfDayIn(timeZone, now);

  const [records, reads] = await Promise.all([
    getAttentionRecords(now, { userId, today }),
    prisma.notificationRead.findMany({ where: { userId }, select: { itemKey: true, readAt: true } }),
  ]);
  const readAtByKey = new Map(reads.map((read) => [read.itemKey, read.readAt]));
  const readAtFor = (key: string) => readAtByKey.get(key) ?? null;

  const derived: DerivedNotification[] = [];
  for (const record of records) {
    const notification = ((): DerivedNotification | null => {
      switch (record.kind) {
        case "document":
          return toDerivedNotification("document", record.id, getDocumentNotificationCandidate(record, today, remindersEnabled, locale), readAtFor);
        case "milestone":
          return toDerivedNotification("milestone", record.id, getMilestoneNotificationCandidate({ id: record.id, name: record.name, dueDate: record.dueDate, goal: { id: record.goalId, name: record.goalName } }, today, milestoneLeadDays, remindersEnabled), readAtFor);
        case "relationship":
          return toDerivedNotification("relationship", record.id, remindersEnabled ? getRelationshipDateNotificationCandidate(record, today, relationshipLeadDays) : null, readAtFor);
        case "custom":
          return toDerivedNotification("custom", record.id, getCustomItemNotificationCandidate(record, today, customItemLeadDays, locale, remindersEnabled), readAtFor, { icon: record.moduleIcon, color: record.moduleColor });
        case "todo":
          // getAttentionRecords already excludes closed to-dos, so the literal
          // open status here only satisfies getTodoNotificationCandidate's own
          // (now redundant, still harmless) isOpenTodoStatus check -- it is
          // never the record's real status, which this function never needed.
          return toDerivedNotification("todo", record.id, getTodoNotificationCandidate({ id: record.id, name: record.name, dueDate: record.dueDate, status: "TODO" }, today, todoLeadDays, remindersEnabled), readAtFor);
      }
    })();
    if (notification) derived.push(notification);
  }

  return derived.sort(byRecency);
}
