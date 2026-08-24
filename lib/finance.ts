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
