import { describe, expect, it } from "vitest";
import {
  getFinanceBalance,
  getFinanceProjection,
  getMonthlyCashFlow,
  getProjectedAmount,
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

/**
 * KD-044: an asset/liability with a `rate` finally has something read it --
 * the balance projects forward from `balanceAsOf`, one whole month at a
 * time, compounding monthly.
 */
describe("getFinanceProjection: KD-044 automatic interest/repayment arithmetic", () => {
  const asset = (overrides: Partial<FinanceItem> = {}): FinanceItem =>
    ({ id: "a", name: "Savings", kind: "asset", amount: 10_000, ...overrides });
  const liability = (overrides: Partial<FinanceItem> = {}): FinanceItem =>
    ({ id: "l", name: "Loan", kind: "liability", amount: 10_000, ...overrides });

  it("projects nothing for an item with no rate", () => {
    expect(getFinanceProjection(asset({ balanceAsOf: "2026-01-01" }), new Date("2026-06-01"))).toEqual([]);
  });

  it("projects nothing for income or expense, even if a rate somehow got set", () => {
    const item = { id: "i", name: "Salary", kind: "income" as const, amount: 5_000, rate: 5, balanceAsOf: "2026-01-01" };
    expect(getFinanceProjection(item, new Date("2026-06-01"))).toEqual([]);
  });

  it("projects nothing without a recorded balanceAsOf", () => {
    expect(getFinanceProjection(asset({ rate: 6 }), new Date("2026-06-01"))).toEqual([]);
  });

  it("projects nothing before a whole month has elapsed", () => {
    const item = asset({ rate: 6, balanceAsOf: "2026-01-01" });
    expect(getFinanceProjection(item, new Date("2026-01-20"))).toEqual([]);
  });

  it("compounds a liability's interest monthly, with no payment", () => {
    const item = liability({ amount: 1_200, rate: 12, balanceAsOf: "2026-01-01" });
    const entries = getFinanceProjection(item, new Date("2026-03-01"));
    // 1% monthly (12% p.a. / 12): 1200 -> 1212 -> 1224.12. The second month's
    // interest (1212 * 0.01) doesn't land on an exact float, so it's checked
    // to the cent rather than by strict equality.
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ period: "2026-02-01", interest: 12, contribution: 0, balance: 1_212 });
    expect(entries[1].period).toBe("2026-03-01");
    expect(entries[1].contribution).toBe(0);
    expect(entries[1].interest).toBeCloseTo(12.12, 10);
    expect(entries[1].balance).toBeCloseTo(1_224.12, 10);
  });

  it("reduces a liability's balance by its fixed monthly payment, after that month's interest", () => {
    const item = liability({ amount: 1_200, rate: 12, monthlyContribution: 500, balanceAsOf: "2026-01-01" });
    const entries = getFinanceProjection(item, new Date("2026-02-01"));
    expect(entries).toEqual([{ period: "2026-02-01", interest: 12, contribution: -500, balance: 712 }]);
  });

  it("stops accruing interest once a liability is paid off, rather than going negative", () => {
    const item = liability({ amount: 500, rate: 12, monthlyContribution: 500, balanceAsOf: "2026-01-01" });
    const entries = getFinanceProjection(item, new Date("2026-04-01"));
    // Month 1: 500 + 5 interest - 500 payment = 5, clamped to a positive remainder.
    // Month 2: 5 + 0.05 - 500 would go negative, clamped to 0.
    // Month 3: already at 0, so no further entry is generated at all.
    expect(entries).toEqual([
      { period: "2026-02-01", interest: 5, contribution: -500, balance: 5 },
      { period: "2026-03-01", interest: 0.05, contribution: -500, balance: 0 },
    ]);
  });

  it("grows an asset by interest plus any monthly contribution", () => {
    const item = asset({ amount: 10_000, rate: 6, monthlyContribution: 200, balanceAsOf: "2026-01-01" });
    const entries = getFinanceProjection(item, new Date("2026-02-01"));
    // 0.5% monthly (6% p.a. / 12) of 10,000 = 50, plus a 200 contribution.
    expect(entries).toEqual([{ period: "2026-02-01", interest: 50, contribution: 200, balance: 10_250 }]);
  });

  it("clamps the projected month to the target month's length rather than rolling over", () => {
    const item = asset({ amount: 1_000, rate: 12, balanceAsOf: "2026-01-31" });
    const entries = getFinanceProjection(item, new Date("2026-03-01"));
    expect(entries[0].period).toBe("2026-02-28");
  });

  describe("getProjectedAmount", () => {
    it("returns the confirmed amount unchanged when nothing has accrued yet", () => {
      expect(getProjectedAmount(asset({ amount: 5_000 }), new Date("2026-06-01"))).toBe(5_000);
      expect(getProjectedAmount(asset({ amount: 5_000, rate: 6, balanceAsOf: "2026-06-01" }), new Date("2026-06-01"))).toBe(5_000);
    });

    it("returns the balance from the last projected month", () => {
      const item = liability({ amount: 1_200, rate: 12, balanceAsOf: "2026-01-01" });
      expect(getProjectedAmount(item, new Date("2026-03-01"))).toBeCloseTo(1_224.12, 10);
    });
  });

  it("feeds getFinanceBalance's totals, so net worth reflects live balances too", () => {
    const items = [
      liability({ amount: 1_200, rate: 12, balanceAsOf: "2026-01-01" }),
      asset({ amount: 10_000, rate: 6, monthlyContribution: 200, balanceAsOf: "2026-01-01" }),
    ];
    const balance = getFinanceBalance(items, new Date("2026-02-01"));
    expect(balance).toEqual({ assets: 10_250, liabilities: 1_212, netWorth: 10_250 - 1_212 });
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

  it("rejects a date that is correctly shaped but does not exist on the calendar", () => {
    // A plain `Date` rolls an out-of-range day into the next month rather than
    // failing, so 2026-02-30 has to be rejected by validating the parts.
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
    expect(isCalendarDate("2026-01-32")).toBe(false);
  });

  it("still accepts the leap day in a year that has one", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-12-31")).toBe(true);
  });
});
