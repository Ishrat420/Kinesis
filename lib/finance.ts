import { parseDateOnly } from "@/lib/dates";

export const FINANCE_KINDS = ["asset", "liability", "income", "expense"] as const;
export const FINANCE_FREQUENCIES = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Yearly"] as const;
export const ASSET_CATEGORIES = ["Cash", "Savings", "Property", "Investment", "Vehicle", "Superannuation", "Other"];
export const LIABILITY_CATEGORIES = ["Credit Card", "Mortgage", "Personal Loan", "Car Loan", "Student Loan", "Other"];

export type FinanceKind = (typeof FINANCE_KINDS)[number];
export type FinanceFrequency = (typeof FINANCE_FREQUENCIES)[number];

export type FinanceItem = {
  id: string;
  kind: FinanceKind;
  name: string;
  amount: number;
  category?: string;
  rate?: number;
  frequency?: FinanceFrequency;
  startDate?: string;
  endDate?: string;
  notes?: string;
};

export const isFinanceKind = (value: unknown): value is FinanceKind =>
  FINANCE_KINDS.includes(value as FinanceKind);
export const isFinanceFrequency = (value: unknown): value is FinanceFrequency =>
  FINANCE_FREQUENCIES.includes(value as FinanceFrequency);
/**
 * `Date` silently rolls an out-of-range day into the next month, so parsing
 * alone accepts 2026-02-30 as 2 March. `parseDateOnly` rejects any value whose
 * parts do not survive the round trip, which is what this guard needs.
 */
export const isCalendarDate = (value: string) => parseDateOnly(value) !== null;

const monthlyFactor: Record<FinanceFrequency, number> = {
  Weekly: 52 / 12,
  Fortnightly: 26 / 12,
  Monthly: 1,
  Quarterly: 4 / 12,
  Yearly: 1 / 12,
};

function isActiveRecurringItem(item: FinanceItem, date: Date) {
  const day = date.toISOString().slice(0, 10);
  return (!item.startDate || item.startDate <= day) && (!item.endDate || item.endDate >= day);
}

export function getMonthlyCashFlow(items: FinanceItem[], date = new Date()) {
  const monthlyTotal = (kind: "income" | "expense") =>
    items
      .filter((item) => item.kind === kind && isActiveRecurringItem(item, date))
      .reduce(
        (sum, item) => sum + item.amount * monthlyFactor[item.frequency ?? "Monthly"],
        0,
      );

  const income = monthlyTotal("income");
  const expenses = monthlyTotal("expense");
  return { income, expenses, netCashFlow: income - expenses };
}

export function getFinanceBalance(items: FinanceItem[]) {
  const total = (kind: FinanceKind) =>
    items
      .filter((item) => item.kind === kind)
      .reduce((sum, item) => sum + item.amount, 0);
  const assets = total("asset");
  const liabilities = total("liability");

  return { assets, liabilities, netWorth: assets - liabilities };
}
