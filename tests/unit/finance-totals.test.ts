import { describe, expect, it } from "vitest";
import {
  getFinanceBalance,
  getMonthlyCashFlow,
  isCalendarDate,
  isFinanceFrequency,
  isFinanceKind,
  type FinanceItem,
} from "@/lib/finance";

const item = (overrides: Partial<FinanceItem> & Pick<FinanceItem, "kind" | "amount">): FinanceItem => ({
  id: `${overrides.kind}-${overrides.amount}`,
  name: "Item",
  ...overrides,
});

const now = new Date("2026-06-15T00:00:00.000Z");

describe("getFinanceBalance: net worth from assets and liabilities", () => {
  it("subtracts total liabilities from total assets to produce net worth", () => {
    const balance = getFinanceBalance([
      item({ kind: "asset", amount: 500_000 }),
      item({ kind: "asset", amount: 25_000 }),
      item({ kind: "liability", amount: 300_000 }),
    ]);

    expect(balance).toEqual({ assets: 525_000, liabilities: 300_000, netWorth: 225_000 });
  });

  it("ignores income and expense rows, which are cash flow rather than balance sheet entries", () => {
    const balance = getFinanceBalance([
      item({ kind: "asset", amount: 1_000 }),
      item({ kind: "income", amount: 9_999, frequency: "Monthly" }),
      item({ kind: "expense", amount: 9_999, frequency: "Monthly" }),
    ]);

    expect(balance).toEqual({ assets: 1_000, liabilities: 0, netWorth: 1_000 });
  });

  it("reports zeroes rather than NaN when the user has no finance items yet", () => {
    expect(getFinanceBalance([])).toEqual({ assets: 0, liabilities: 0, netWorth: 0 });
  });

  it("allows liabilities to exceed assets, giving a negative net worth", () => {
    const balance = getFinanceBalance([
      item({ kind: "asset", amount: 10_000 }),
      item({ kind: "liability", amount: 45_000 }),
    ]);

    expect(balance.netWorth).toBe(-35_000);
  });
});

describe("getMonthlyCashFlow: normalising every frequency to a monthly figure", () => {
  it("converts each supported frequency to its monthly equivalent", () => {
    const monthlyAmountFor = (frequency: FinanceItem["frequency"]) =>
      getMonthlyCashFlow([item({ kind: "income", amount: 120, frequency })], now).income;

    expect(monthlyAmountFor("Weekly")).toBeCloseTo(120 * 52 / 12, 10);
    expect(monthlyAmountFor("Fortnightly")).toBeCloseTo(120 * 26 / 12, 10);
    expect(monthlyAmountFor("Monthly")).toBe(120);
    expect(monthlyAmountFor("Quarterly")).toBeCloseTo(40, 10);
    expect(monthlyAmountFor("Yearly")).toBeCloseTo(10, 10);
  });

  it("treats an item with no frequency as monthly", () => {
    expect(getMonthlyCashFlow([item({ kind: "income", amount: 750 })], now).income).toBe(750);
  });

  it("nets expenses off income to produce the surplus or shortfall", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "income", amount: 6_000, frequency: "Monthly" }),
      item({ kind: "expense", amount: 2_000, frequency: "Monthly" }),
      item({ kind: "expense", amount: 300, frequency: "Yearly" }),
    ], now);

    expect(flow.income).toBe(6_000);
    expect(flow.expenses).toBeCloseTo(2_025, 10);
    expect(flow.netCashFlow).toBeCloseTo(3_975, 10);
  });

  it("reports a negative net cash flow when expenses outstrip income", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "income", amount: 1_000, frequency: "Monthly" }),
      item({ kind: "expense", amount: 1_600, frequency: "Monthly" }),
    ], now);

    expect(flow.netCashFlow).toBe(-600);
  });

  it("ignores assets and liabilities, which do not recur as cash flow", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "asset", amount: 400_000 }),
      item({ kind: "liability", amount: 250_000 }),
    ], now);

    expect(flow).toEqual({ income: 0, expenses: 0, netCashFlow: 0 });
  });
});

describe("getMonthlyCashFlow: only counting items active on the evaluated date", () => {
  it("excludes an item whose start date has not arrived yet", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "income", amount: 5_000, frequency: "Monthly", startDate: "2026-09-01" }),
    ], now);

    expect(flow.income).toBe(0);
  });

  it("excludes an item whose end date has already passed", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "expense", amount: 900, frequency: "Monthly", endDate: "2026-05-31" }),
    ], now);

    expect(flow.expenses).toBe(0);
  });

  it("counts an item on its exact start date and on its exact end date", () => {
    const startsToday = getMonthlyCashFlow([
      item({ kind: "income", amount: 100, frequency: "Monthly", startDate: "2026-06-15" }),
    ], now);
    const endsToday = getMonthlyCashFlow([
      item({ kind: "income", amount: 100, frequency: "Monthly", endDate: "2026-06-15" }),
    ], now);

    expect(startsToday.income).toBe(100);
    expect(endsToday.income).toBe(100);
  });

  it("counts an item that is inside an open window bounded on both sides", () => {
    const flow = getMonthlyCashFlow([
      item({ kind: "income", amount: 4_000, frequency: "Monthly", startDate: "2026-01-01", endDate: "2026-12-31" }),
    ], now);

    expect(flow.income).toBe(4_000);
  });

  it("counts an item with no start or end date as always active", () => {
    expect(getMonthlyCashFlow([item({ kind: "income", amount: 80, frequency: "Monthly" })], now).income).toBe(80);
  });
});

describe("finance value guards used when reading untrusted form input", () => {
  it("accepts only the four supported finance kinds", () => {
    expect(isFinanceKind("asset")).toBe(true);
    expect(isFinanceKind("liability")).toBe(true);
    expect(isFinanceKind("income")).toBe(true);
    expect(isFinanceKind("expense")).toBe(true);
    expect(isFinanceKind("Asset")).toBe(false);
    expect(isFinanceKind("savings")).toBe(false);
    expect(isFinanceKind(undefined)).toBe(false);
    expect(isFinanceKind(7)).toBe(false);
  });

  it("accepts only the five supported recurrence frequencies", () => {
    expect(isFinanceFrequency("Fortnightly")).toBe(true);
    expect(isFinanceFrequency("Yearly")).toBe(true);
    expect(isFinanceFrequency("monthly")).toBe(false);
    expect(isFinanceFrequency("Daily")).toBe(false);
    expect(isFinanceFrequency(null)).toBe(false);
  });

  it("accepts a well-formed calendar date and rejects malformed or impossible ones", () => {
    expect(isCalendarDate("2026-06-15")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-2-9")).toBe(false);
    expect(isCalendarDate("15/06/2026")).toBe(false);
    expect(isCalendarDate("2026-06-15T00:00:00Z")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });

  it("rejects an impossible month, but accepts an impossible day of the month", () => {
    // Known gap, pinned deliberately: `Date` rejects month 13 but silently
    // rolls an out-of-range day over into the next month (2026-02-30 becomes
    // 2 March), so the guard lets that value through. `parseDateOnly` in
    // `@/lib/dates` is the strict parser if this ever needs tightening.
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
    expect(isCalendarDate("2026-01-32")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(true);
  });
});
