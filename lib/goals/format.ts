import { formatDecimal } from "@/lib/format/numbers";

export const GOAL_STATUSES = ["Active", "Revisit Later", "Finished", "Archived"] as const;
export const DEFAULT_GOAL_UNITS = ["$AUD", "$USD", "Books", "Clients", "Km", "Kg", "Days"];

/**
 * Whether a goal's own target date has passed while it is still Active
 * (KD-028) -- a purely computed, display-only fact. It changes nothing about
 * what the goal counts as everywhere else (`activeGoalWhere` doesn't ask this
 * question at all); it only tells a status chip to read "Overdue" and a card
 * to wear a red border, in place of the silent auto-archive this replaced.
 * A goal that isn't Active is never "overdue" -- it was already resolved, by
 * hand.
 */
export function isGoalOverdue(status: string, targetDate: Date | null, today: Date) {
  return status === "Active" && targetDate !== null && targetDate.getTime() < today.getTime();
}

export function displayNumber(value: number, unit?: string | null, locale?: string) {
  // Goal units are free text that may already carry a currency prefix, so this
  // stays plain number formatting rather than the configured currency.
  const number = formatDecimal(value, locale);
  return unit?.startsWith("$") ? `${unit} ${number}` : `${number}${unit ? ` ${unit}` : ""}`;
}
