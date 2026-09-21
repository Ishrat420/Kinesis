"use client";

import { CalendarDays, Check, ChevronDown, ArrowDownLeft, ArrowUpRight, Building2, CreditCard, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSET_CATEGORIES,
  FINANCE_FREQUENCIES,
  type FinanceItem,
  type FinanceKind as Kind,
  LIABILITY_CATEGORIES,
  getFinanceProjection,
  getInterestDayLabel,
  getLiabilityHealth,
  getMonthsToPayoff,
  getProjectedAmount,
  MAX_PAYOFF_MONTHS,
} from "@/lib/finance";
import { formatDate, formatDateInput } from "@/lib/dates";
import { NOTES_LIMIT } from "@/lib/validation/field-limits";
import { deleteFinanceItemAction, saveFinanceItemAction, type FinanceActionState } from "@/app/(app)/finance/actions";
import { useFormatPreferences } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";
import { Modal } from "@/components/overlay/Modal";

/**
 * The Add/Edit form, the delete confirmation, and everything they lean on
 * (field styling, category/frequency lookups, the health/projection
 * read-outs) -- shared between FinanceDashboard's modal-based create/edit
 * flow and the item's own detail page/window (KD-048), rather than
 * duplicated between the two.
 */
export const initialState: FinanceActionState = {};

/** Binds the owner's locale and currency so call sites stay a single call. */
export function useMoney() {
  const { locale, currency } = useFormatPreferences();
  return (value: number) => formatMoney(value, locale, currency);
}

export const kindLabels: Record<Kind, string> = { asset: "Asset", liability: "Liability", income: "Income", expense: "Expense" };
export const KIND_ICONS: Record<Kind, typeof Building2> = { asset: Building2, liability: CreditCard, income: ArrowDownLeft, expense: ArrowUpRight };
export const KIND_TONE_CLASS: Record<Kind, string> = {
  asset: "bg-emerald-50 text-emerald-700", income: "bg-emerald-50 text-emerald-700",
  liability: "bg-rose-50 text-rose-700", expense: "bg-rose-50 text-rose-700",
};
/**
 * A real border and real size (50px) at rest, the same treatment every
 * redesigned create/edit form in the app shares, in Finance's own emerald
 * (matching the module's colour everywhere else it appears -- the command
 * bar, the flow cards above).
 */
export const FIELD_CLASS =
  "h-[50px] w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/15 sm:text-sm";

/** The confirmation stacks on top of whatever it can be raised from (the dashboard's edit dialog, or the item's own detail page/window), so it always sits a tier above it. */
export function DeleteFinanceItem({ item, onCancel, onDeleted }: { item: FinanceItem; onCancel: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(() => deleteFinanceItemAction(item.id), initialState);
  useEffect(() => { if (state.saved) { router.refresh(); onDeleted(); } }, [state.saved, router, onDeleted]);

  return <Modal title={`Delete ${item.name}?`} onClose={onCancel} panelClassName="sm:max-w-sm"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5"/></div><p className="mt-5 text-sm leading-6 text-zinc-500">This will remove the item and immediately update your totals. This action cannot be undone.</p>{state.error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{state.error}</p>}<form action={formAction} className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={pending} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70">{pending ? "Deleting…" : "Delete item"}</button></form></Modal>;
}

/** Rounded to cents for a number input's defaultValue -- the projection itself stays exact. */
export function roundMoney(value: number) { return Math.round(value * 100) / 100; }

/**
 * A date field that reads as a row with an answer on it ("5 Jan 2026")
 * rather than a native date input's blank box -- easy to mistake for a
 * broken field, especially on mobile Safari where it shows nothing at all
 * until a value is picked. The row's onClick calls showPicker() on the real
 * input directly, since a plain click-through to a transparent absolutely-
 * positioned input isn't reliably opening the calendar; the real input is
 * still what's keyboard- and screen-reader-operable.
 */
export function DateField({ name, value, onChange, ariaLabel }: { name: string; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [focused, setFocused] = useState(false);
  const { locale } = useFormatPreferences();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.showPicker?.()}
      className={`relative flex h-[50px] cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] bg-white px-3.5 transition ${
        focused ? "border-emerald-600 ring-4 ring-emerald-600/15" : "border-zinc-200"
      }`}
    >
      <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
      <span className={`flex-1 truncate text-base sm:text-sm ${value ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
        {value ? formatDate(value, locale) : "Select a date"}
      </span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
      <input
        ref={inputRef}
        type="date"
        name={name}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const required = label.endsWith(" *");
  const text = required ? label.slice(0, -2) : label;
  return <label className="block"><span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900">{text} {required && <span className="font-bold text-red-500">*</span>}</span>{children}</label>;
}

export function FinanceForm({ kind, item, onSaved, today }: { kind: Kind; item: FinanceItem | null; onSaved: () => void; today: Date }) {
  const router = useRouter();
  const [state, formAction, saving] = useActionState(saveFinanceItemAction.bind(null, kind, item?.id ?? null), initialState);
  const error = state.error ?? null;
  useEffect(() => { if (state.saved) { router.refresh(); onSaved(); } }, [state.saved, router, onSaved]);
  const balance = kind === "liability";
  const recurring = kind === "income" || kind === "expense";
  const categories = balance ? LIABILITY_CATEGORIES : ASSET_CATEGORIES;
  const projection = item ? getFinanceProjection(item, today) : [];
  const defaultAmount = item ? roundMoney(getProjectedAmount(item, today)) : undefined;
  const interestDay = item ? getInterestDayLabel(item) : undefined;

  // Amount, rate and monthly payment are controlled (rather than
  // defaultValue-only) so the AT RISK / ON TRACK badge below can recompute
  // as the person types, instead of only reflecting whatever was true when
  // the dialog opened -- which otherwise stays stale until they save,
  // reopen, and look again. On save the server always sets balanceAsOf to
  // today (see saveFinanceItem in actions.ts) and the amount submitted
  // becomes the new confirmed balance, so evaluating health against exactly
  // that -- today's typed amount, zero elapsed months -- is what "saved
  // right now" would actually produce.
  const [amountInput, setAmountInput] = useState(defaultAmount !== undefined ? String(defaultAmount) : "");
  const [rateInput, setRateInput] = useState(item?.rate !== undefined ? String(item.rate) : "");
  const [contributionInput, setContributionInput] = useState(item?.monthlyContribution !== undefined ? String(item.monthlyContribution) : "");
  const [startDateInput, setStartDateInput] = useState(item?.startDate ?? "");
  const [endDateInput, setEndDateInput] = useState(item?.endDate ?? "");

  const liveAmount = Number(amountInput);
  const liveRate = rateInput.trim() === "" ? undefined : Number(rateInput);
  const liveContribution = contributionInput.trim() === "" ? undefined : Number(contributionInput);
  const canEvaluateLive = Number.isFinite(liveAmount)
    && (liveRate === undefined || Number.isFinite(liveRate))
    && (liveContribution === undefined || Number.isFinite(liveContribution));
  const liveItem: FinanceItem | null = canEvaluateLive
    ? { id: item?.id ?? "", kind, name: item?.name ?? "", amount: liveAmount, rate: liveRate, monthlyContribution: liveContribution, balanceAsOf: formatDateInput(today) }
    : null;
  const health = liveItem ? getLiabilityHealth(liveItem, today) : undefined;
  const monthsToPayoff = liveItem ? getMonthsToPayoff(liveItem, today) : undefined;

  return <form action={formAction} className="mt-6 space-y-4">
    <Field label="Name *"><input name="name" required defaultValue={item?.name} placeholder={`e.g. ${kind === "asset" ? "Savings Account" : kind === "liability" ? "Credit Card" : kind === "income" ? "Salary" : "Living Expenses"}`} className={FIELD_CLASS}/></Field>
    <Field label={`${balance ? "Balance" : "Amount"} *`}><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">$</span><input name="amount" type="number" min="0" step="0.01" required value={amountInput} onChange={(event) => setAmountInput(event.target.value)} className={`${FIELD_CLASS} pl-8`}/></div></Field>
    {!recurring ? <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category"><div className="relative"><select name="category" defaultValue={item?.category} className={`${FIELD_CLASS} appearance-none pr-9`}>{categories.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"/></div></Field>
        <Field label={`${balance ? "Interest" : "Interest / growth"} rate`}><div className="relative"><input name="rate" type="number" min="0" step="0.01" value={rateInput} onChange={(event) => setRateInput(event.target.value)} placeholder="Optional" className={`${FIELD_CLASS} pr-10`}/><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400">%</span></div></Field>
      </div>
      <Field label={balance ? "Monthly payment" : "Monthly contribution"}><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">$</span><input name="monthlyContribution" type="number" min="0" step="0.01" value={contributionInput} onChange={(event) => setContributionInput(event.target.value)} placeholder="Optional" className={`${FIELD_CLASS} pl-8`}/></div></Field>
      {interestDay && <p className="text-xs text-zinc-400">Interest added monthly on {interestDay}.</p>}
      {health && <FinanceHealthBadge health={health} monthsToPayoff={monthsToPayoff}/>}
      <FinanceProjectionHistory entries={projection} balance={balance}/>
    </> : <>
      <Field label="Frequency *"><div className="relative"><select name="frequency" required defaultValue={item?.frequency || "Monthly"} className={`${FIELD_CLASS} appearance-none pr-9`}>{FINANCE_FREQUENCIES.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"/></div></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Start date"><DateField name="startDate" value={startDateInput} onChange={setStartDateInput} ariaLabel="Start date"/></Field><Field label="End date"><DateField name="endDate" value={endDateInput} onChange={setEndDateInput} ariaLabel="End date"/></Field></div>
    </>}
    <Field label="Notes"><textarea name="notes" rows={3} maxLength={NOTES_LIMIT} defaultValue={item?.notes} placeholder="Optional details" className={`${FIELD_CLASS} min-h-[92px] resize-y py-3`}/></Field>
    {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
    <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70">{saving ? "Saving…" : <><Check className="h-4 w-4" aria-hidden="true"/>{item ? "Save changes" : `Add ${kindLabels[kind]}`}</>}</button>
  </form>;
}

/**
 * KD-044 Part B: is the fixed monthly payment actually paying this liability
 * down? Reuses Goals' ON TRACK / AT RISK vocabulary and its amber/emerald
 * tone convention (app/(app)/goals/[goalId]/page.tsx) rather than a second
 * one for the same kind of question. Edit-only for now -- not shown on the
 * list row.
 */
/** "1 year, 8 months" -- whole months only, since the model never steps in anything finer than a month. */
export function formatPayoffDuration(months: number): string {
  if (months >= MAX_PAYOFF_MONTHS) return "more than 100 years";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts = [
    years ? `${years} year${years === 1 ? "" : "s"}` : "",
    remainder ? `${remainder} month${remainder === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "less than a month";
}

export function FinanceHealthBadge({ health, monthsToPayoff }: { health: NonNullable<ReturnType<typeof getLiabilityHealth>>; monthsToPayoff?: number }) {
  const money = useMoney();
  const atRisk = health.status === "AT RISK";
  const netChange = health.payment - health.monthlyInterest;
  // A payment and its interest can land a fraction of a cent apart without
  // actually being different, so "exactly flat" is a tolerance, not `=== 0`.
  const flat = Math.abs(netChange) < 0.005;
  const Icon = atRisk ? TrendingDown : TrendingUp;
  return <div className={`rounded-2xl border p-4 ${atRisk ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
    <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${atRisk ? "text-amber-700" : "text-emerald-700"}`}><Icon className="h-3.5 w-3.5"/>{health.status}</p>
    <div className={`mt-1.5 space-y-1.5 text-sm leading-5 ${atRisk ? "text-amber-800" : "text-emerald-800"}`}>
      {flat ? <>
        <p>This debt will stay exactly the same each month, your {money(health.payment)} payment only covers the {money(health.monthlyInterest)} in interest that&apos;s accruing.</p>
        <p>At this rate, it will never be paid off.</p>
      </> : atRisk ? <>
        <p>This debt will grow by about {money(-netChange)} this month, your {money(health.payment)} payment doesn&apos;t cover the {money(health.monthlyInterest)} in interest that&apos;s accruing.</p>
        <p>At this rate, it will never be paid off.</p>
      </> : <>
        <p>This debt will shrink by about {money(netChange)} this month, your {money(health.payment)} payment covers the {money(health.monthlyInterest)} in interest.</p>
        <p>At this rate, it will take about {monthsToPayoff !== undefined ? formatPayoffDuration(monthsToPayoff) : "a while"} to pay off.</p>
      </>}
    </div>
  </div>;
}

/**
 * KD-044's auditable trail: every month of interest/payment the projection
 * applied since this item's balance was last confirmed, so "why did the
 * number change" always has a visible answer instead of a silent jump. If
 * the real statement disagrees, editing the balance above (which is already
 * prefilled with this same live number) resets the starting point -- there
 * is no per-month entry to edit in isolation, by design (see KD-044).
 */
export function FinanceProjectionHistory({ entries, balance }: { entries: ReturnType<typeof getFinanceProjection>; balance: boolean }) {
  const money = useMoney();
  if (!entries.length) return null;
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">Last auto-applied</p><ul className="mt-3 space-y-1.5 text-sm">{entries.map((entry) => <li key={entry.period} className="flex items-center justify-between gap-3 text-zinc-600"><span>{formatDate(entry.period)}</span><span className="text-right">+{money(entry.interest)} interest{entry.contribution !== 0 && <>, {entry.contribution > 0 ? "+" : "−"}{money(Math.abs(entry.contribution))} {balance ? "payment" : "contribution"}</>} → <span className="font-semibold text-zinc-900">{money(entry.balance)}</span></span></li>)}</ul></div>;
}
