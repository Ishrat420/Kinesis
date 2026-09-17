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
import { notificationRecordLink } from "@/lib/notifications/identity";

/**
 * Every notification the owner should currently see, computed rather than
 * stored: the candidates themselves are still a pure function of the
 * records, the day and the settings, no different than before. The one
 * write here is narrower than that -- not the notification, only the
 * instant this itemKey was first derived for this owner, and only the first
 * time (see the `NotificationFirstSeen` block below); a re-run for the same
 * key, on the next page load, writes nothing new. Everything else this
 * function reads-not-writes, exactly as before: which of them have already
 * been read.
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

  const derived: Omit<DerivedNotification, "firstSeenAt">[] = [];
  for (const record of records) {
    const notification = ((): Omit<DerivedNotification, "firstSeenAt"> | null => {
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

  // `NotificationFirstSeen`: when each of these reached the owner, for
  // byRecency to sort by -- first, not read order, not deadline order (see
  // lib/notifications/engine.ts). One batched lookup for keys already known,
  // one batched insert for whichever are new, rather than a round trip per
  // notification: this runs on every page load (Topbar renders it on every
  // authenticated route), so anything per-notification here runs that often.
  const keys = derived.map((notification) => notification.key);
  const seen = keys.length
    ? await prisma.notificationFirstSeen.findMany({ where: { userId, itemKey: { in: keys } }, select: { itemKey: true, firstSeenAt: true } })
    : [];
  const firstSeenByKey = new Map(seen.map((row) => [row.itemKey, row.firstSeenAt]));
  const newlySeen = derived.filter((notification) => !firstSeenByKey.has(notification.key));
  if (newlySeen.length) {
    try {
      await prisma.notificationFirstSeen.createMany({
        data: newlySeen.map((notification) => ({
          id: crypto.randomUUID(), userId, itemKey: notification.key, firstSeenAt: now,
          ...notificationRecordLink(notification.source, notification.sourceId),
        })),
        skipDuplicates: true,
      });
    } catch (failure) {
      // A failed write here must never take the bell down -- everything
      // newly seen this render still sorts correctly (as "now", below); it
      // just isn't durable yet, and the next render that reaches this line
      // tries recording it again.
      console.error("Failed to record when a notification was first seen", failure);
    }
    for (const notification of newlySeen) firstSeenByKey.set(notification.key, now);
  }

  const withFirstSeen: DerivedNotification[] = derived.map((notification) => ({
    ...notification,
    firstSeenAt: firstSeenByKey.get(notification.key)!,
  }));

  return withFirstSeen.sort(byRecency);
}
