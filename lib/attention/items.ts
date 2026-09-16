import { startOfUtcDay } from "@/lib/dates";
import { getExpiryReminderDate } from "@/lib/documents/expiry";
import { getReminderWindowStart, getReminderWindowEnd } from "@/lib/reminders/policy";
import { getNextOccurrence, type ImportantDateOccurrenceInput } from "@/lib/relationships/occurrence";

/**
 * KD-017 Step One, Phase 1: the record shape `lib/data/attention-items.ts`'s
 * `getAttentionRecords` returns, and the small, per-surface status functions
 * built on it.
 *
 * Deliberately not one precomputed `status: overdue | due-soon | fine` field.
 * ADR-010 (Notification And Reminders Awareness Surfaces) documents the
 * overdue/due-soon boundary as a genuinely different rule per surface, and
 * for Upcoming & Due, per record kind too -- collapsing that into one shared
 * value here would either be wrong for some consumer, or require this
 * module to already know which one is asking. Every function below is cited
 * to the ADR-010 line or table it implements, so the ADR stays the one
 * place this logic is written down (its own stated purpose, line 21) rather
 * than re-derived per file the way it was before.
 *
 * Pure and DB-free on purpose, split out from `lib/data/attention-items.ts`
 * the way `lib/goals/milestone-window.ts` sits apart from `lib/data/goals.ts`
 * -- so these rules stay unit-testable without a database or a mocked
 * Prisma client, and importable from `next/server`-free contexts.
 */

type DocumentAttentionRecord = { kind: "document"; id: string; name: string; expiryDate: Date; prompt: number };
type MilestoneAttentionRecord = { kind: "milestone"; id: string; name: string; dueDate: Date; goalId: string; goalName: string };
type CustomItemAttentionRecord = { kind: "custom"; id: string; name: string; dueDate: Date; moduleId: string; moduleName: string; moduleIcon: string; moduleColor: string };
type TodoAttentionRecord = { kind: "todo"; id: string; name: string; dueDate: Date };
type RelationshipAttentionRecord = { kind: "relationship"; id: string; label: string; date: Date; repeatsYearly: boolean; personName: string };

export type AttentionRecord =
  | DocumentAttentionRecord
  | MilestoneAttentionRecord
  | CustomItemAttentionRecord
  | TodoAttentionRecord
  | RelationshipAttentionRecord;

/**
 * The four kinds Needs Attention can ever show. A relationship date is never
 * overdue anywhere (ADR-010, "Other Exceptions" #1: "They're the only
 * reminder source absent from Needs Attention") -- expressed here as a type
 * exclusion rather than a runtime check, so a caller cannot even ask the
 * question for one.
 */
export type NeedsAttentionEligible = Exclude<AttentionRecord, RelationshipAttentionRecord>;

/**
 * Needs Attention's one rule, the same for all four kinds it can show:
 * strict `<`, so the deadline's own day is not yet overdue. ADR-010 line 26:
 * "Needs Attention uses < today consistently... No exceptions" -- including
 * documents, whose `expiryDate < today` here is the same boundary as
 * `today > expiryDate` in the notification engine's EXPIRED check, just
 * written the other way round.
 */
export function isOverdueForNeedsAttention(record: NeedsAttentionEligible, today: Date): boolean {
  const date = record.kind === "document" ? record.expiryDate : record.dueDate;
  return startOfUtcDay(date)! < today;
}

/**
 * Upcoming & Due shows two phases per record: an advance notice while
 * counting down, and this one once the deadline reads as reached. "overdue"
 * is this module's umbrella term for it (KD-017 Phase 0) -- the surface
 * itself labels it differently per kind ("expired", "over its due date",
 * "due", "due / overdue").
 */
export type UpcomingPhase = "overdue" | "due-soon";

/**
 * A document's phase never depends on `remindersEnabled` for the overdue
 * side: ADR-010's Documents settings-gate table has "Upcoming & Due —
 * expired" surviving `reminders is not ticked`, same as "Bell — EXPIRED".
 * Only the advance ("expiring") phase is gated.
 */
export function documentUpcomingPhase(record: DocumentAttentionRecord, today: Date, remindersEnabled: boolean): UpcomingPhase | null {
  const expiry = startOfUtcDay(record.expiryDate)!;
  if (expiry < today) return "overdue";
  if (!remindersEnabled) return null;
  return today >= getExpiryReminderDate(expiry, record.prompt) ? "due-soon" : null;
}

/**
 * Shared by milestones and custom items, whose Upcoming & Due rule is
 * identical: the due date itself still reads "due soon" (matching Needs
 * Attention's own boundary), and the overdue row always survives
 * `remindersEnabled` being off -- ADR-010's settings-gate tables have
 * "Upcoming & Due — over its due date" / "— due" surviving "reminders is
 * not ticked", same as the bell's `MILESTONE_DUE`/`CUSTOM_ITEM_DUE`.
 *
 * `getUpcomingAndDue` and `collectNotifications` currently gate the whole
 * computation -- due-soon *and* overdue -- on `remindersEnabled` for these
 * two kinds (`lib/data/upcoming.ts:94,140`,
 * `lib/notifications/engine.ts:327,333-335,338`), which drops the overdue
 * row too. That's the bug KD-017 Phase 0 found; this is the corrected rule.
 */
function dueDateUpcomingPhase(dueDate: Date, today: Date, leadDays: number, remindersEnabled: boolean): UpcomingPhase | null {
  const due = startOfUtcDay(dueDate)!;
  if (due < today) return "overdue";
  if (!remindersEnabled) return null;
  return today >= getReminderWindowStart(due, leadDays) ? "due-soon" : null;
}

export function milestoneUpcomingPhase(record: MilestoneAttentionRecord, today: Date, leadDays: number, remindersEnabled: boolean): UpcomingPhase | null {
  return dueDateUpcomingPhase(record.dueDate, today, leadDays, remindersEnabled);
}

export function customItemUpcomingPhase(record: CustomItemAttentionRecord, today: Date, leadDays: number, remindersEnabled: boolean): UpcomingPhase | null {
  return dueDateUpcomingPhase(record.dueDate, today, leadDays, remindersEnabled);
}

/**
 * A to-do's due date itself already reads as reached ("is due"), not "due
 * soon" -- the one deliberate exception within Upcoming & Due, not a bug.
 * ADR-010 line 123: "`TODO_DUE` is a statement of fact", the same reasoning
 * a document's `EXPIRED` gets, so it does not wait for the day after the
 * way a milestone or custom item's overdue phase does.
 */
export function todoUpcomingPhase(record: TodoAttentionRecord, today: Date, leadDays: number, remindersEnabled: boolean): UpcomingPhase | null {
  const due = startOfUtcDay(record.dueDate)!;
  if (due <= today) return "overdue";
  if (!remindersEnabled) return null;
  return today >= getReminderWindowStart(due, leadDays) ? "due-soon" : null;
}

/**
 * A relationship date is never overdue -- it rolls forward (yearly) or stops
 * existing (one-off) the moment it passes, so `getNextOccurrence` never
 * hands back a past date to begin with (ADR-010, "Other Exceptions" #1).
 * Unlike every other kind, its Upcoming & Due row is gated on
 * `remindersEnabled` entirely, with no fact-vs-prediction split to preserve.
 */
export function relationshipUpcomingPhase(record: RelationshipAttentionRecord, today: Date, leadDays: number, remindersEnabled: boolean): "due-soon" | null {
  if (!remindersEnabled) return null;
  const occurrence = getNextOccurrence(record as ImportantDateOccurrenceInput, today);
  if (!occurrence) return null;
  return occurrence.getTime() <= getReminderWindowEnd(today, leadDays).getTime() ? "due-soon" : null;
}
