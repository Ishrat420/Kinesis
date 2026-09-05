import { addUtcDays } from "@/lib/dates";

/**
 * Object types whose "how far ahead should this warn me" window is a single,
 * user-configurable lead time (as opposed to documents, which already carry
 * their own per-record `prompt`). Adding a new one here plus a matching
 * `UserSettings` column and default is the whole extension: every reader goes
 * through `getReminderLeadDays` / `getReminderWindowStart` below, so nothing
 * else needs to change per object type.
 */
export type ReminderObjectType = "milestone" | "relationship" | "customItem";

export const REMINDER_LEAD_DEFAULTS: Record<ReminderObjectType, number> = {
  milestone: 30,
  relationship: 30,
  customItem: 30,
};

const LEAD_DAYS_FIELD = {
  milestone: "milestoneReminderLeadDays",
  relationship: "relationshipReminderLeadDays",
  customItem: "customItemReminderLeadDays",
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
