"use client";

import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building2, CalendarClock, CreditCard, Landmark, Pencil, Plus, Trash2, WalletCards, X,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FinanceItem,
  type FinanceKind as Kind,
  getFinanceBalance,
  getMonthlyCashFlow,
  getNextInterestDate,
  getProjectedAmount,
} from "@/lib/finance";
import { formatDate } from "@/lib/dates";
import { useToday } from "@/lib/format/context";
import { Modal } from "@/components/overlay/Modal";
import { DeleteFinanceItem, FinanceForm, KIND_ICONS, KIND_TONE_CLASS, kindLabels, useMoney } from "./FinanceItemForm";

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

    {modal && <Modal labelledBy="finance-dialog-title" onClose={closeModal} customHeader panelClassName="p-6 sm:p-7 !rounded-t-2xl sm:!rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {modal === "form" && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${KIND_TONE_CLASS[formKind]}`}>{(() => { const Icon = KIND_ICONS[formKind]; return <Icon className="h-5 w-5" />; })()}</span>}
          <div><h2 id="finance-dialog-title" className="text-xl font-semibold">{modal === "choose" ? "What would you like to add?" : `${editing ? "Edit" : "Add"} ${kindLabels[formKind]}`}</h2>{modal === "choose" && <p className="mt-1 text-sm text-zinc-500">Choose the type of financial item.</p>}</div>
        </div>
        <button type="button" aria-label="Close dialog" onClick={closeModal} className="shrink-0 rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5"/></button>
      </div>
      {modal === "choose" ? <div className="mt-6 grid grid-cols-2 gap-3">{(["asset", "liability", "income", "expense"] as Kind[]).map((kind) => <button key={kind} onClick={() => openForm(kind)} className="group rounded-2xl border border-zinc-200 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${kind === "asset" || kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{kind === "income" ? <ArrowDownLeft className="h-5 w-5"/> : kind === "expense" ? <ArrowUpRight className="h-5 w-5"/> : kind === "asset" ? <Building2 className="h-5 w-5"/> : <CreditCard className="h-5 w-5"/>}</span><span className="mt-4 block font-semibold">Add {kindLabels[kind]}</span><span className="mt-1 block text-xs text-zinc-500">{kind === "asset" ? "Something you own" : kind === "liability" ? "A balance you owe" : kind === "income" ? "Recurring money in" : "Recurring money out"}</span></button>)}</div> : <FinanceForm kind={formKind} item={editing} onSaved={closeModal} today={today}/>}
    </Modal>}
    {deleting && <DeleteFinanceItem item={deleting} onCancel={closeDeleteModal} onDeleted={closeDeleteModal}/>}
  </>;
}

function DarkStat({ label, value }: { label: string; value: number }) { const money = useMoney(); return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-medium text-zinc-400">{label}</p><p className="mt-2 text-xl font-semibold">{money(value)}</p></div>; }
function FlowCard({ icon: Icon, label, value, tone, signed = false }: { icon: typeof Banknote; label: string; value: number; tone: string; signed?: boolean }) { const money = useMoney(); const positive = tone === "emerald"; return <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><Icon className="h-5 w-5"/></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${signed ? positive ? "text-emerald-600" : "text-rose-600" : ""}`}>{signed && value > 0 ? "+" : ""}{money(value)}</p></div>; }

/**
 * Each row's name/icon/amount is a `<Link>` to the item's own detail page
 * (KD-048's History section, opened as a "big window" over this dashboard --
 * see app/(app)/@modal/(.)finance/[itemId]/page.tsx). The Edit/Delete icon
 * buttons stay siblings outside the link rather than nested inside it, and
 * the `id="finance-<id>"` anchor BUG-008's search deep-link scrolls to stays
 * on the outer row div, unaffected by the link wrapping only part of it.
 */
function ItemSection({ title, subtitle, icon: Icon, items, onEdit, onDelete, today, recurring = false }: { title: string; subtitle: string; icon: typeof Banknote; items: FinanceItem[]; onEdit: (kind: Kind, item: FinanceItem) => void; onDelete: (item: FinanceItem) => void; today: Date; recurring?: boolean }) { const money = useMoney(); return <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><Icon className="h-5 w-5"/></div><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-zinc-400">{subtitle}</p></div></div><div className="mt-5 divide-y divide-zinc-100">{items.length ? items.map((item) => { const nextInterest = recurring ? undefined : getNextInterestDate(item, today); return <div key={item.id} id={`finance-${item.id}`} className="group flex scroll-mt-24 items-center gap-3 py-4 first:pt-1 last:pb-0"><Link href={`/finance/${item.id}`} className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-zinc-50"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.kind === "income" ? "bg-emerald-50 text-emerald-600" : item.kind === "expense" ? "bg-rose-50 text-rose-600" : "bg-zinc-50 text-zinc-500"}`}>{item.kind === "income" ? <ArrowDownLeft className="h-4 w-4"/> : item.kind === "expense" ? <ArrowUpRight className="h-4 w-4"/> : <Landmark className="h-4 w-4"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-zinc-400">{recurring ? kindLabels[item.kind] : item.category || kindLabels[item.kind]}{item.rate !== undefined ? ` · ${item.rate}% p.a.` : ""}</p>{nextInterest && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-zinc-400"><CalendarClock className="h-3 w-3"/>Next interest {formatDate(nextInterest)}</p>}</div><div className="text-right"><p className="text-sm font-semibold">{money(recurring ? item.amount : getProjectedAmount(item, today))}{recurring && <span className="font-normal text-zinc-400"> / {item.frequency?.toLowerCase()}</span>}</p></div></Link><div className="flex opacity-60 transition group-hover:opacity-100"><button aria-label={`Edit ${item.name}`} onClick={() => onEdit(item.kind, item)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4"/></button><button aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></div>; }) : <p className="py-8 text-center text-sm text-zinc-400">Nothing here yet.</p>}</div></section>; }
