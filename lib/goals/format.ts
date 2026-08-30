import { formatDecimal } from "@/lib/format/numbers";

export const GOAL_STATUSES = ["Active", "Revisit Later", "Finished", "Archived"] as const;
export const DEFAULT_GOAL_UNITS = ["$AUD", "$USD", "Books", "Clients", "Km", "Kg", "Days"];

export function effectiveStatus(status: string, targetDate: Date | null, now = new Date()) {
  if (targetDate && targetDate.getTime() < now.getTime() && status === "Active") return "Archived";
  return status;
}

export function displayNumber(value: number, unit?: string | null, locale?: string) {
  // Goal units are free text that may already carry a currency prefix, so this
  // stays plain number formatting rather than the configured currency.
  const number = formatDecimal(value, locale);
  return unit?.startsWith("$") ? `${unit} ${number}` : `${number}${unit ? ` ${unit}` : ""}`;
}
