export const GOAL_STATUSES = ["Active", "Revisit Later", "Finished", "Archived"] as const;
export const DEFAULT_GOAL_UNITS = ["$AUD", "$USD", "Books", "Clients", "Km", "Kg", "Days"];

export function effectiveStatus(status: string, targetDate: Date | null, now = new Date()) {
  if (targetDate && targetDate.getTime() < now.getTime() && status === "Active") return "Archived";
  return status;
}

export function displayNumber(value: number, unit?: string | null) {
  const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value);
  return unit?.startsWith("$") ? `${unit} ${number}` : `${number}${unit ? ` ${unit}` : ""}`;
}
