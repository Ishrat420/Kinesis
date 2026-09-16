"use client";

import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building2,
  CalendarClock, CreditCard, Landmark, Pencil, Plus, Trash2, WalletCards, X,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSET_CATEGORIES,
  FINANCE_FREQUENCIES,
  type FinanceItem,
  type FinanceKind as Kind,
  LIABILITY_CATEGORIES,
  getFinanceBalance,
  getFinanceProjection,
  getInterestDayLabel,
  getLiabilityHealth,
  getMonthlyCashFlow,
  getMonthsToPayoff,
  getNextInterestDate,
  getProjectedAmount,
  MAX_PAYOFF_MONTHS,
} from "@/lib/finance";
import { formatDate } from "@/lib/dates";
import { deleteFinanceItemAction, saveFinanceItemAction, type FinanceActionState } from "@/app/(app)/finance/actions";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";
import { Modal } from "@/components/overlay/Modal";

const initialState: FinanceActionState = {};
/** Binds the owner's locale and currency so call sites stay a single call. */
function useMoney() {
  const { locale, currency } = useFormatPreferences();
  return (value: number) => formatMoney(value, locale, currency);
}

const kindLabels: Record<Kind, string> = { asset: "Asset", liability: "Liability", income: "Income", expense: "Expense" };
/**
 * `items` is read straight from the props on every render rather than seeded
 * into state. The save and delete actions both revalidate this route, so the
 * server sends the list back as it was actually stored -- where the dashboard
 * used to patch a local copy with an item rebuilt in the browser, and showed
 * that instead.
 */
export function FinanceDashboard({ items }: { items: FinanceItem[] }) {
  const money = useMoney();
  const today = useToday();
  const [modal, setModal] = useState<"choose" | "form" | null>(null);
  const [formKind, setFormKind] = useState<Kind>("asset");
  const [editing, setEditing] = useState<FinanceItem | null>(null);
  const [deleting, setDeleting] = useState<FinanceItem | null>(null);

  /**
   * A finance search result deep-links here as /finance#finance-<id>
   * (BUG-008), but this route renders behind loading.tsx. Next's own
   * hash-to-element scroll fires as soon as that fallback mounts -- before
   * any row with a matching id exists -- finds nothing, and never retries
   * once the real rows stream in: the attempt is consumed regardless of
   * whether it found its target. This repeats the lookup once this
   * component -- the real content, never the fallback -- has actually
   * mounted with its rows in the DOM.
   */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, []);

  const totals = useMemo(() => {
    const { assets, liabilities, netWorth } = getFinanceBalance(items, today);
    const { income, expenses, netCashFlow } = getMonthlyCashFlow(items, today);
    return { assets, liabilities, income, expenses, netWorth, flow: netCashFlow };
  }, [items, today]);

  function openForm(kind: Kind, item: FinanceItem | null = null) { setFormKind(kind); setEditing(item); setModal("form"); }
  const closeModal = useCallback(() => { setModal(null); setEditing(null); }, []);
  const closeDeleteModal = useCallback(() => setDeleting(null), []);

  const assets = items.filter((item) => item.kind === "asset");
  const liabilities = items.filter((item) => item.kind === "liability");
  const recurring = items.filter((item) => item.kind === "income" || item.kind === "expense");
  return <>
    <ModuleHeader
      title="Finance"
      description={<>Money in, money out, the whole situation.<br/>See what you own, owe, earn and spend.</>}
      actions={<button onClick={() => setModal("choose")} className="flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-zinc-800"><Plus className="h-[18px] w-[18px]"/>Add</button>}
    />

    <section className="mt-9 overflow-hidden rounded-[28px] bg-zinc-950 p-6 text-white shadow-[0_18px_50px_rgb(0,0,0,0.12)] sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"><Landmark className="h-4 w-4"/>Net worth</div><p className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{money(totals.netWorth)}</p><p className="mt-3 text-sm text-zinc-400">The difference between everything you own and owe.</p></div><div className="grid grid-cols-2 gap-3"><DarkStat label="Total assets" value={totals.assets}/><DarkStat label="Total liabilities" value={totals.liabilities}/></div></div>
    </section>

    <section className="mt-5 grid gap-5 md:grid-cols-3"><FlowCard icon={ArrowDownLeft} label="Monthly income" value={totals.income} tone="emerald"/><FlowCard icon={ArrowUpRight} label="Monthly expenses" value={totals.expenses} tone="rose"/><FlowCard icon={Banknote} label="Net monthly cash flow" value={totals.flow} tone={totals.flow >= 0 ? "emerald" : "rose"} signed/></section>

    <div className="mt-5 grid gap-5 xl:grid-cols-2"><ItemSection title="Assets" subtitle={`${assets.length} things you own`} icon={Building2} items={assets} onEdit={openForm} onDelete={setDeleting} today={today}/><ItemSection title="Liabilities" subtitle={`${liabilities.length} things you owe`} icon={CreditCard} items={liabilities} onEdit={openForm} onDelete={setDeleting} today={today}/></div>
    <div className="mt-5"><ItemSection title="Recurring income & expenses" subtitle="Your regular money in and out" icon={WalletCards} items={recurring} onEdit={openForm} onDelete={setDeleting} today={today} recurring/></div>

    {modal && <Modal labelledBy="finance-dialog-title" onClose={closeModal} customHeader panelClassName="p-6 sm:p-7">
      <div className="flex items-start justify-between"><div><h2 id="finance-dialog-title" className="text-xl font-semibold">{modal === "choose" ? "What would you like to add?" : `${editing ? "Edit" : "Add"} ${kindLabels[formKind]}`}</h2><p className="mt-1 text-sm text-zinc-500">{modal === "choose" ? "Choose the type of financial item." : "Keep it high-level — you can update this anytime."}</p></div><button type="button" aria-label="Close dialog" onClick={closeModal} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5"/></button></div>
      {modal === "choose" ? <div className="mt-6 grid grid-cols-2 gap-3">{(["asset", "liability", "income", "expense"] as Kind[]).map((kind) => <button key={kind} onClick={() => openForm(kind)} className="group rounded-2xl border border-zinc-200 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${kind === "asset" || kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{kind === "income" ? <ArrowDownLeft className="h-5 w-5"/> : kind === "expense" ? <ArrowUpRight className="h-5 w-5"/> : kind === "asset" ? <Building2 className="h-5 w-5"/> : <CreditCard className="h-5 w-5"/>}</span><span className="mt-4 block font-semibold">Add {kindLabels[kind]}</span><span className="mt-1 block text-xs text-zinc-500">{kind === "asset" ? "Something you own" : kind === "liability" ? "A balance you owe" : kind === "income" ? "Recurring money in" : "Recurring money out"}</span></button>)}</div> : <FinanceForm kind={formKind} item={editing} onSaved={closeModal} today={today}/>}
    </Modal>}
    {deleting && <DeleteFinanceItem item={deleting} onCancel={closeDeleteModal} onDeleted={closeDeleteModal}/>}
  </>;
}

/** The confirmation stacks on top of the form dialog it can be raised from, so it sits a tier above it. */
function DeleteFinanceItem({ item, onCancel, onDeleted }: { item: FinanceItem; onCancel: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(() => deleteFinanceItemAction(item.id), initialState);
  useEffect(() => { if (state.saved) { router.refresh(); onDeleted(); } }, [state.saved, router, onDeleted]);

  return <Modal title={`Delete ${item.name}?`} onClose={onCancel} panelClassName="sm:max-w-sm"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5"/></div><p className="mt-5 text-sm leading-6 text-zinc-500">This will remove the item and immediately update your totals. This action cannot be undone.</p>{state.error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{state.error}</p>}<form action={formAction} className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={pending} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70">{pending ? "Deleting…" : "Delete item"}</button></form></Modal>;
}

function DarkStat({ label, value }: { label: string; value: number }) { const money = useMoney(); return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-medium text-zinc-400">{label}</p><p className="mt-2 text-xl font-semibold">{money(value)}</p></div>; }
function FlowCard({ icon: Icon, label, value, tone, signed = false }: { icon: typeof Banknote; label: string; value: number; tone: string; signed?: boolean }) { const money = useMoney(); const positive = tone === "emerald"; return <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><Icon className="h-5 w-5"/></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${signed ? positive ? "text-emerald-600" : "text-rose-600" : ""}`}>{signed && value > 0 ? "+" : ""}{money(value)}</p></div>; }

function ItemSection({ title, subtitle, icon: Icon, items, onEdit, onDelete, today, recurring = false }: { title: string; subtitle: string; icon: typeof Banknote; items: FinanceItem[]; onEdit: (kind: Kind, item: FinanceItem) => void; onDelete: (item: FinanceItem) => void; today: Date; recurring?: boolean }) { const money = useMoney(); return <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><Icon className="h-5 w-5"/></div><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-zinc-400">{subtitle}</p></div></div><div className="mt-5 divide-y divide-zinc-100">{items.length ? items.map((item) => { const nextInterest = recurring ? undefined : getNextInterestDate(item, today); return <div key={item.id} id={`finance-${item.id}`} className="group flex scroll-mt-24 items-center gap-3 py-4 first:pt-1 last:pb-0"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.kind === "income" ? "bg-emerald-50 text-emerald-600" : item.kind === "expense" ? "bg-rose-50 text-rose-600" : "bg-zinc-50 text-zinc-500"}`}>{item.kind === "income" ? <ArrowDownLeft className="h-4 w-4"/> : item.kind === "expense" ? <ArrowUpRight className="h-4 w-4"/> : <Landmark className="h-4 w-4"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-zinc-400">{recurring ? kindLabels[item.kind] : item.category || kindLabels[item.kind]}{item.rate !== undefined ? ` · ${item.rate}% p.a.` : ""}</p>{nextInterest && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-zinc-400"><CalendarClock className="h-3 w-3"/>Next interest {formatDate(nextInterest)}</p>}</div><div className="text-right"><p className="text-sm font-semibold">{money(recurring ? item.amount : getProjectedAmount(item, today))}{recurring && <span className="font-normal text-zinc-400"> / {item.frequency?.toLowerCase()}</span>}</p></div><div className="flex opacity-60 transition group-hover:opacity-100"><button aria-label={`Edit ${item.name}`} onClick={() => onEdit(item.kind, item)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4"/></button><button aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></div>; }) : <p className="py-8 text-center text-sm text-zinc-400">Nothing here yet.</p>}</div></section>; }

/** Rounded to cents for a number input's defaultValue -- the projection itself stays exact. */
function roundMoney(value: number) { return Math.round(value * 100) / 100; }

function FinanceForm({ kind, item, onSaved, today }: { kind: Kind; item: FinanceItem | null; onSaved: () => void; today: Date }) { const router = useRouter(); const [state, formAction, saving] = useActionState(saveFinanceItemAction.bind(null, kind, item?.id ?? null), initialState); const error = state.error ?? null; useEffect(() => { if (state.saved) { router.refresh(); onSaved(); } }, [state.saved, router, onSaved]); const balance = kind === "liability"; const recurring = kind === "income" || kind === "expense"; const categories = balance ? LIABILITY_CATEGORIES : ASSET_CATEGORIES; const projection = item ? getFinanceProjection(item, today) : []; const defaultAmount = item ? roundMoney(getProjectedAmount(item, today)) : undefined; const interestDay = item ? getInterestDayLabel(item) : undefined; const health = item ? getLiabilityHealth(item, today) : undefined; const monthsToPayoff = item ? getMonthsToPayoff(item, today) : undefined; return <form action={formAction} className="mt-6 space-y-4"><Field label="Name *"><input name="name" required defaultValue={item?.name} placeholder={`e.g. ${kind === "asset" ? "Savings Account" : kind === "liability" ? "Credit Card" : kind === "income" ? "Salary" : "Living Expenses"}`} className="input"/></Field><Field label={`${balance ? "Balance" : "Amount"} *`}><div className="relative"><span className="absolute left-4 top-3 text-zinc-400">$</span><input name="amount" type="number" min="0" step="0.01" required defaultValue={defaultAmount} className="input pl-8"/></div></Field>{!recurring ? <><div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><select name="category" defaultValue={item?.category} className="input">{categories.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label={`${balance ? "Interest" : "Interest / growth"} rate`}><div className="relative"><input name="rate" type="number" min="0" step="0.01" defaultValue={item?.rate} placeholder="Optional" className="input pr-10"/><span className="absolute right-4 top-3 text-zinc-400">%</span></div></Field></div><Field label={balance ? "Monthly payment" : "Monthly contribution"}><div className="relative"><span className="absolute left-4 top-3 text-zinc-400">$</span><input name="monthlyContribution" type="number" min="0" step="0.01" defaultValue={item?.monthlyContribution} placeholder="Optional" className="input pl-8"/></div></Field>{interestDay && <p className="text-xs text-zinc-400">Interest added monthly on {interestDay}.</p>}{health && <FinanceHealthBadge health={health} monthsToPayoff={monthsToPayoff}/>}<FinanceProjectionHistory entries={projection} balance={balance}/></> : <><Field label="Frequency *"><select name="frequency" required defaultValue={item?.frequency || "Monthly"} className="input">{FINANCE_FREQUENCIES.map((value) => <option key={value}>{value}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Start date"><input name="startDate" type="date" defaultValue={item?.startDate} className="input"/></Field><Field label="End date"><input name="endDate" type="date" defaultValue={item?.endDate} className="input"/></Field></div></>}<Field label="Notes"><textarea name="notes" rows={3} defaultValue={item?.notes} placeholder="Optional details" className="input resize-none"/></Field>{error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}<button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70">{saving ? "Saving…" : item ? "Save changes" : `Add ${kindLabels[kind]}`}</button></form>; }

/**
 * KD-044 Part B: is the fixed monthly payment actually paying this liability
 * down? Reuses Goals' ON TRACK / AT RISK vocabulary and its amber/emerald
 * tone convention (app/(app)/goals/[goalId]/page.tsx) rather than a second
 * one for the same kind of question. Edit-only for now -- not shown on the
 * list row.
 */
/** "1 year, 8 months" -- whole months only, since the model never steps in anything finer than a month. */
function formatPayoffDuration(months: number): string {
  if (months >= MAX_PAYOFF_MONTHS) return "more than 100 years";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts = [
    years ? `${years} year${years === 1 ? "" : "s"}` : "",
    remainder ? `${remainder} month${remainder === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "less than a month";
}

function FinanceHealthBadge({ health, monthsToPayoff }: { health: NonNullable<ReturnType<typeof getLiabilityHealth>>; monthsToPayoff?: number }) {
  const money = useMoney();
  const atRisk = health.status === "AT RISK";
  const netChange = health.payment - health.monthlyInterest;
  // A payment and its interest can land a fraction of a cent apart without
  // actually being different, so "exactly flat" is a tolerance, not `=== 0`.
  const flat = Math.abs(netChange) < 0.005;
  return <div className={`rounded-2xl border p-4 ${atRisk ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
    <p className={`text-xs font-semibold uppercase tracking-[0.1em] ${atRisk ? "text-amber-700" : "text-emerald-700"}`}>{health.status}</p>
    <p className={`mt-1.5 text-sm leading-5 ${atRisk ? "text-amber-800" : "text-emerald-800"}`}>
      {flat
        ? <>This debt will stay exactly the same each month, your {money(health.payment)} payment only covers the {money(health.monthlyInterest)} in interest that&apos;s accruing. At this rate, it will never be paid off.</>
        : atRisk
        ? <>This debt will grow by about {money(-netChange)} this month, your {money(health.payment)} payment doesn&apos;t cover the {money(health.monthlyInterest)} in interest that&apos;s accruing. At this rate, it will never be paid off.</>
        : <>This debt will shrink by about {money(netChange)} this month, your {money(health.payment)} payment covers the {money(health.monthlyInterest)} in interest. At this rate, it will take about {monthsToPayoff !== undefined ? formatPayoffDuration(monthsToPayoff) : "a while"} to pay off.</>}
    </p>
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
function FinanceProjectionHistory({ entries, balance }: { entries: ReturnType<typeof getFinanceProjection>; balance: boolean }) {
  const money = useMoney();
  if (!entries.length) return null;
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">Last auto-applied</p><ul className="mt-3 space-y-1.5 text-sm">{entries.map((entry) => <li key={entry.period} className="flex items-center justify-between gap-3 text-zinc-600"><span>{formatDate(entry.period)}</span><span className="text-right">+{money(entry.interest)} interest{entry.contribution !== 0 && <>, {entry.contribution > 0 ? "+" : "−"}{money(Math.abs(entry.contribution))} {balance ? "payment" : "contribution"}</>} → <span className="font-semibold text-zinc-900">{money(entry.balance)}</span></span></li>)}</ul></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-zinc-700">{label}</span>{children}</label>; }
