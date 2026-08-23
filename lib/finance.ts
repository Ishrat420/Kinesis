export type FinanceKind = "asset" | "liability" | "income" | "expense";
export type FinanceFrequency = "Weekly" | "Fortnightly" | "Monthly" | "Quarterly" | "Yearly";

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

export const FINANCE_STORAGE_KEY = "kinesis-finance-items";

export const defaultFinanceItems: FinanceItem[] = [];

export function getFinanceBalance(items: FinanceItem[]) {
  const total = (kind: FinanceKind) =>
    items
      .filter((item) => item.kind === kind)
      .reduce((sum, item) => sum + item.amount, 0);
  const assets = total("asset");
  const liabilities = total("liability");

  return { assets, liabilities, netWorth: assets - liabilities };
}
