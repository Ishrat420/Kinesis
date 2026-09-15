import { addUtcDays } from "@/lib/dates";

/**
 * Object types whose "how far ahead should this warn me" window is a single,
 * user-configurable lead time (as opposed to documents, which already carry
 * their own per-record `prompt`). Adding a new one here plus a matching
 * `UserSettings` column and default is the whole extension: every reader goes
 * through `getReminderLeadDays` / `getReminderWindowStart` below, so nothing
 * else needs to change per object type.
 */
export type ReminderObjectType = "milestone" | "relationship" | "customItem" | "todo";

export const REMINDER_LEAD_DEFAULTS: Record<ReminderObjectType, number> = {
  milestone: 30,
  relationship: 30,
  customItem: 30,
  // Unlike the other three, a to-do previously had no advance stage at all
  // (KD-027), so defaulting it to 30 like the others would silently start
  // warning about every dated to-do a month early the moment this shipped.
  // Zero preserves exactly what a to-do already did: silent until due.
  todo: 0,
};

const LEAD_DAYS_FIELD = {
  milestone: "milestoneReminderLeadDays",
  relationship: "relationshipReminderLeadDays",
  customItem: "customItemReminderLeadDays",
  todo: "todoReminderLeadDays",
} as const satisfies Record<ReminderObjectType, string>;

type LeadDaysSettings = { [K in ReminderObjectType as (typeof LEAD_DAYS_FIELD)[K]]?: number | null };

/** Resolves the configured lookahead for an object type, falling back to its default. */
export function getReminderLeadDays(settings: LeadDaysSettings | null | undefined, type: ReminderObjectType): number {
  const value = settings?.[LEAD_DAYS_FIELD[type]];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : REMINDER_LEAD_DEFAULTS[type];
}

/** The date a lookahead window opens: `leadDays` before the due date. */
export function getReminderWindowStart(dueDate: Date, leadDays: number) {
  return addUtcDays(dueDate, -leadDays);
}

/** The date a lookahead window closes: `leadDays` after today. */
export function getReminderWindowEnd(today: Date, leadDays: number) {
  return addUtcDays(today, leadDays);
}
