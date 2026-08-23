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

export const defaultFinanceItems: FinanceItem[] = [
  { id: "a1", kind: "asset", name: "House in Mont Albert", amount: 550000, category: "Property" },
  { id: "a2", kind: "asset", name: "Savings Account", amount: 15000, category: "Savings", rate: 2 },
  { id: "a3", kind: "asset", name: "Cash", amount: 2000, category: "Cash" },
  { id: "l1", kind: "liability", name: "Credit Card", amount: 5000, category: "Credit Card", rate: 15 },
  { id: "l2", kind: "liability", name: "Loan from Mum", amount: 1000, category: "Personal Loan" },
  { id: "i1", kind: "income", name: "Monthly Earnings", amount: 5000, frequency: "Monthly" },
  { id: "i2", kind: "income", name: "Car Park Rent", amount: 200, frequency: "Monthly" },
  { id: "e1", kind: "expense", name: "Living Expenses", amount: 3500, frequency: "Monthly" },
];

export function getFinanceBalance(items: FinanceItem[]) {
  const total = (kind: FinanceKind) =>
    items
      .filter((item) => item.kind === kind)
      .reduce((sum, item) => sum + item.amount, 0);
  const assets = total("asset");
  const liabilities = total("liability");

  return { assets, liabilities, netWorth: assets - liabilities };
}
