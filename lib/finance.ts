import { addUtcMonths, formatDateInput, parseDateOnly } from "@/lib/dates";

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
  /** KD-044: an optional fixed monthly repayment (liability) or contribution (asset), alongside `rate`. */
  monthlyContribution?: number;
  /** KD-044: the day `amount` was last confirmed accurate. Every automatic projection below starts from here. */
  balanceAsOf?: string;
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

function isActiveRecurringItem(item: FinanceItem, today: Date) {
  const day = today.toISOString().slice(0, 10);
  return (!item.startDate || item.startDate <= day) && (!item.endDate || item.endDate >= day);
}

/**
 * `today` is the owner's day, not the clock: whether a recurring item has
 * started or finished is a question about their calendar, and reading it in UTC
 * kept an item running for the first hours of the day it was meant to stop.
 */
export function getMonthlyCashFlow(items: FinanceItem[], today: Date) {
  const monthlyTotal = (kind: "income" | "expense") =>
    items
      .filter((item) => item.kind === kind && isActiveRecurringItem(item, today))
      .reduce(
        (sum, item) => sum + item.amount * monthlyFactor[item.frequency ?? "Monthly"],
        0,
      );

  const income = monthlyTotal("income");
  const expenses = monthlyTotal("expense");
  return { income, expenses, netCashFlow: income - expenses };
}

export type FinanceProjectionEntry = {
  /** UTC-midnight, as yyyy-mm-dd: the month this interest/contribution was applied. */
  period: string;
  interest: number;
  /** Positive for an asset (added), negative for a liability (paid down). */
  contribution: number;
  balance: number;
};

function wholeMonthsElapsed(start: Date, end: Date): number {
  let months = 0;
  while (addUtcMonths(start, months + 1) <= end) months += 1;
  return months;
}

/**
 * KD-044: projects a FinanceItem's balance forward from `balanceAsOf`
 * (the last confirmed `amount`) to `today`, one whole month at a time,
 * compounding monthly (`rate` ÷ 12) -- the ticket's "simplest default,"
 * applied uniformly rather than left per-item.
 *
 * Gated on `rate` being set, on both ends: nothing here runs for an item
 * that never had a rate (unchanged, purely manual, exactly like before this
 * ticket), and `monthlyContribution` alone -- no rate -- stays inert too,
 * to keep one on/off switch rather than two independent ones. Income and
 * expense items have no concept of an accruing balance at all.
 *
 * A liability's contribution is a repayment (reduces the balance); an
 * asset's is a deposit (adds to it). A liability can't go below zero from
 * an overpayment, and once it reaches zero it stops accruing interest too --
 * a paid-off loan does not compound.
 *
 * Returned entries are the auditable trail: every month applied since the
 * last confirmation, visible rather than folded into a single opaque
 * number. Correcting a wrong projection (the real statement disagreed) is
 * done by editing the item's amount directly, which becomes the new
 * `balanceAsOf` baseline and starts the trail over -- there is no
 * persisted ledger row to edit in isolation, by design (see KD-044).
 */
export function getFinanceProjection(item: FinanceItem, today: Date): FinanceProjectionEntry[] {
  if (item.rate === undefined || (item.kind !== "asset" && item.kind !== "liability")) return [];
  const start = item.balanceAsOf ? parseDateOnly(item.balanceAsOf) : null;
  if (!start) return [];
  const months = wholeMonthsElapsed(start, today);
  if (months <= 0) return [];

  const monthlyRate = item.rate / 100 / 12;
  const contribution = item.monthlyContribution ?? 0;
  const entries: FinanceProjectionEntry[] = [];
  let balance = item.amount;
  for (let index = 1; index <= months; index += 1) {
    if (item.kind === "liability" && balance <= 0) break;
    const interest = balance * monthlyRate;
    balance = item.kind === "liability"
      ? Math.max(0, balance + interest - contribution)
      : balance + interest + contribution;
    entries.push({
      period: formatDateInput(addUtcMonths(start, index)),
      interest,
      // `-contribution` on a zero contribution is `-0`: harmless in the
      // arithmetic above, but a display value nobody wants to see.
      contribution: contribution === 0 ? 0 : item.kind === "liability" ? -contribution : contribution,
      balance,
    });
  }
  return entries;
}

/** The item's live current balance: the last projection entry, or `amount` unchanged if nothing has accrued yet. */
export function getProjectedAmount(item: FinanceItem, today: Date): number {
  const entries = getFinanceProjection(item, today);
  return entries.length ? entries[entries.length - 1].balance : item.amount;
}

/** "1st", "2nd", "3rd", "4th", ... -- for naming the recurring day interest lands on. */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

/**
 * The day of the month interest lands on, in words ("the 15th"), for an item
 * with automatic arithmetic switched on. Fixed by `balanceAsOf` and never
 * changes month to month, even though the actual date it clamps to might
 * (the 31st lands on the 28th/29th in February) -- see `getNextInterestDate`
 * for that concrete next date.
 */
export function getInterestDayLabel(item: FinanceItem): string | undefined {
  if (item.rate === undefined || (item.kind !== "asset" && item.kind !== "liability")) return undefined;
  const start = item.balanceAsOf ? parseDateOnly(item.balanceAsOf) : null;
  return start ? `the ${ordinal(start.getUTCDate())}` : undefined;
}

/**
 * The next concrete date interest will be applied, for "so I know when to
 * expect it" display next to a projected balance. `undefined` once a
 * liability is fully paid off -- getFinanceProjection stops compounding
 * there too, so there is no next application to name.
 */
export function getNextInterestDate(item: FinanceItem, today: Date): string | undefined {
  if (item.rate === undefined || (item.kind !== "asset" && item.kind !== "liability")) return undefined;
  const start = item.balanceAsOf ? parseDateOnly(item.balanceAsOf) : null;
  if (!start) return undefined;
  if (item.kind === "liability" && getProjectedAmount(item, today) <= 0) return undefined;
  return formatDateInput(addUtcMonths(start, wholeMonthsElapsed(start, today) + 1));
}

export type FinanceLiabilityHealth = {
  status: "ON TRACK" | "AT RISK";
  monthlyInterest: number;
  payment: number;
};

/**
 * KD-044 Part B, scoped down to the one case that has a real yes/no answer
 * without inventing a target Finance doesn't have: a liability with a fixed
 * monthly payment is structurally a payoff goal, and whether it's converging
 * depends on nothing else -- does the payment cover this month's interest?
 *
 * `undefined` whenever there's nothing to evaluate: an asset has no payoff
 * to be at risk of missing (it only grows); a liability with no monthly
 * payment has no plan to assess; one already paid off has nothing left to
 * track. Reuses Goals' ON TRACK / AT RISK vocabulary (lib/goals/health.ts)
 * rather than inventing a second one for the same kind of question.
 */
export function getLiabilityHealth(item: FinanceItem, today: Date): FinanceLiabilityHealth | undefined {
  if (item.kind !== "liability" || item.rate === undefined || !item.monthlyContribution) return undefined;
  const balance = getProjectedAmount(item, today);
  if (balance <= 0) return undefined;
  const monthlyInterest = balance * (item.rate / 100 / 12);
  return { status: item.monthlyContribution > monthlyInterest ? "ON TRACK" : "AT RISK", monthlyInterest, payment: item.monthlyContribution };
}

/** 100 years -- a payment barely ahead of interest still has to terminate the simulation below somewhere. */
export const MAX_PAYOFF_MONTHS = 1200;

/**
 * Whole months of the current payment, at the current rate, until this
 * liability reaches zero, assuming nothing else changes. Simulated the same
 * month-by-month way `getFinanceProjection` works, rather than a separate
 * closed-form formula that could quietly disagree with it.
 *
 * `undefined` whenever there's no payoff to reach: AT RISK (including
 * exactly flat), already paid off, or missing a rate or payment. Capped at
 * `MAX_PAYOFF_MONTHS` so a payment only barely ahead of interest can't loop
 * for an unreasonable number of iterations.
 */
export function getMonthsToPayoff(item: FinanceItem, today: Date): number | undefined {
  if (item.kind !== "liability" || item.rate === undefined || !item.monthlyContribution) return undefined;
  const monthlyRate = item.rate / 100 / 12;
  const payment = item.monthlyContribution;
  let balance = getProjectedAmount(item, today);
  if (balance <= 0 || payment <= balance * monthlyRate) return undefined;
  let months = 0;
  while (balance > 0 && months < MAX_PAYOFF_MONTHS) {
    balance = Math.max(0, balance + balance * monthlyRate - payment);
    months += 1;
  }
  return months;
}

/**
 * `today` defaults so every existing caller -- none of which project
 * anything, since none of their fixtures carry a `rate` -- keeps working
 * unchanged; a caller that cares about live balances passes the owner's
 * actual today explicitly.
 */
export function getFinanceBalance(items: FinanceItem[], today: Date = new Date()) {
  const total = (kind: FinanceKind) =>
    items
      .filter((item) => item.kind === kind)
      .reduce((sum, item) => sum + getProjectedAmount(item, today), 0);
  const assets = total("asset");
  const liabilities = total("liability");

  return { assets, liabilities, netWorth: assets - liabilities };
}
