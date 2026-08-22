"use client";

import Link from "next/link";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, Building2,
  CreditCard, Landmark, Pencil, Plus, Trash2, WalletCards, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Kind = "asset" | "liability" | "income" | "expense";
type Frequency = "Weekly" | "Fortnightly" | "Monthly" | "Quarterly" | "Yearly";
type FinanceItem = {
  id: string; kind: Kind; name: string; amount: number; category?: string;
  rate?: number; frequency?: Frequency; startDate?: string; endDate?: string; notes?: string;
};

const defaults: FinanceItem[] = [
  { id: "a1", kind: "asset", name: "House in Mont Albert", amount: 550000, category: "Property" },
  { id: "a2", kind: "asset", name: "Savings Account", amount: 15000, category: "Savings", rate: 2 },
  { id: "a3", kind: "asset", name: "Cash", amount: 2000, category: "Cash" },
  { id: "l1", kind: "liability", name: "Credit Card", amount: 5000, category: "Credit Card", rate: 15 },
  { id: "l2", kind: "liability", name: "Loan from Mum", amount: 1000, category: "Personal Loan" },
  { id: "i1", kind: "income", name: "Monthly Earnings", amount: 5000, frequency: "Monthly" },
  { id: "i2", kind: "income", name: "Car Park Rent", amount: 200, frequency: "Monthly" },
  { id: "e1", kind: "expense", name: "Living Expenses", amount: 3500, frequency: "Monthly" },
];

const assetCategories = ["Cash", "Savings", "Property", "Investment", "Vehicle", "Superannuation", "Other"];
const liabilityCategories = ["Credit Card", "Mortgage", "Personal Loan", "Car Loan", "Student Loan", "Other"];
const frequencies: Frequency[] = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Yearly"];
const kindLabels: Record<Kind, string> = { asset: "Asset", liability: "Liability", income: "Income", expense: "Expense" };
const monthlyFactor: Record<Frequency, number> = { Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1, Quarterly: 4 / 12, Yearly: 1 / 12 };
const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function FinanceDashboard() {
  const [items, setItems] = useState(defaults);
  const [modal, setModal] = useState<"choose" | "form" | null>(null);
  const [formKind, setFormKind] = useState<Kind>("asset");
  const [editing, setEditing] = useState<FinanceItem | null>(null);
  const [deleting, setDeleting] = useState<FinanceItem | null>(null);

  const totals = useMemo(() => {
    const sum = (kind: Kind) => items.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount, 0);
    const recurring = (kind: "income" | "expense") => items.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount * monthlyFactor[item.frequency || "Monthly"], 0);
    const assets = sum("asset"), liabilities = sum("liability"), income = recurring("income"), expenses = recurring("expense");
    return { assets, liabilities, income, expenses, netWorth: assets - liabilities, flow: income - expenses };
  }, [items]);

  function openForm(kind: Kind, item: FinanceItem | null = null) { setFormKind(kind); setEditing(item); setModal("form"); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const next: FinanceItem = { id: editing?.id || crypto.randomUUID(), kind: formKind, name: String(data.get("name")), amount: Number(data.get("amount")), notes: String(data.get("notes") || "") };
    if (formKind === "asset" || formKind === "liability") { next.category = String(data.get("category")); const rate = data.get("rate"); if (rate !== "") next.rate = Number(rate); }
    else { next.frequency = String(data.get("frequency")) as Frequency; next.startDate = String(data.get("startDate") || ""); next.endDate = String(data.get("endDate") || ""); }
    setItems((current) => editing ? current.map((item) => item.id === editing.id ? next : item) : [...current, next]); setModal(null); setEditing(null);
  }
  function remove() { if (!deleting) return; setItems((current) => current.filter((item) => item.id !== deleting.id)); setDeleting(null); }

  const assets = items.filter((item) => item.kind === "asset");
  const liabilities = items.filter((item) => item.kind === "liability");
  const recurring = items.filter((item) => item.kind === "income" || item.kind === "expense");
  return <main className="min-h-screen bg-[#f7f8fb] px-5 py-7 text-zinc-950 sm:px-8 lg:px-10">
    <div className="mx-auto max-w-7xl">
      <header className="flex items-start justify-between gap-5">
        <div><Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50"><ArrowLeft className="h-4 w-4"/>Back to dashboard</Link><h1 className="text-[38px] font-semibold leading-none tracking-tight">Finance</h1><p className="mt-3 text-base leading-7 text-zinc-500">Your financial picture, all in one place.<br/>See what you own, owe, earn and spend.</p></div>
        <button onClick={() => setModal("choose")} className="mt-14 flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-zinc-800"><Plus className="h-[18px] w-[18px]"/>Add</button>
      </header>

      <section className="mt-9 overflow-hidden rounded-[28px] bg-zinc-950 p-6 text-white shadow-[0_18px_50px_rgb(0,0,0,0.12)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"><Landmark className="h-4 w-4"/>Net worth</div><p className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{money.format(totals.netWorth)}</p><p className="mt-3 text-sm text-zinc-400">The difference between everything you own and owe.</p></div><div className="grid grid-cols-2 gap-3"><DarkStat label="Total assets" value={totals.assets}/><DarkStat label="Total liabilities" value={totals.liabilities}/></div></div>
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-3"><FlowCard icon={ArrowDownLeft} label="Monthly income" value={totals.income} tone="emerald"/><FlowCard icon={ArrowUpRight} label="Monthly expenses" value={totals.expenses} tone="rose"/><FlowCard icon={Banknote} label="Net monthly cash flow" value={totals.flow} tone={totals.flow >= 0 ? "emerald" : "rose"} signed/></section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2"><ItemSection title="Assets" subtitle={`${assets.length} things you own`} icon={Building2} items={assets} onEdit={openForm} onDelete={setDeleting}/><ItemSection title="Liabilities" subtitle={`${liabilities.length} things you owe`} icon={CreditCard} items={liabilities} onEdit={openForm} onDelete={setDeleting}/></div>
      <div className="mt-5"><ItemSection title="Recurring income & expenses" subtitle="Your regular money in and out" icon={WalletCards} items={recurring} onEdit={openForm} onDelete={setDeleting} recurring/></div>
    </div>

    {modal && <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7">
      <div className="flex items-start justify-between"><div><p className="text-xl font-semibold">{modal === "choose" ? "What would you like to add?" : `${editing ? "Edit" : "Add"} ${kindLabels[formKind]}`}</p><p className="mt-1 text-sm text-zinc-500">{modal === "choose" ? "Choose the type of financial item." : "Keep it high-level — you can update this anytime."}</p></div><button aria-label="Close" onClick={() => setModal(null)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5"/></button></div>
      {modal === "choose" ? <div className="mt-6 grid grid-cols-2 gap-3">{(["asset", "liability", "income", "expense"] as Kind[]).map((kind) => <button key={kind} onClick={() => openForm(kind)} className="group rounded-2xl border border-zinc-200 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${kind === "asset" || kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{kind === "income" ? <ArrowDownLeft className="h-5 w-5"/> : kind === "expense" ? <ArrowUpRight className="h-5 w-5"/> : kind === "asset" ? <Building2 className="h-5 w-5"/> : <CreditCard className="h-5 w-5"/>}</span><span className="mt-4 block font-semibold">Add {kindLabels[kind]}</span><span className="mt-1 block text-xs text-zinc-500">{kind === "asset" ? "Something you own" : kind === "liability" ? "A balance you owe" : kind === "income" ? "Recurring money in" : "Recurring money out"}</span></button>)}</div> : <FinanceForm kind={formKind} item={editing} onSubmit={save}/>} 
    </div></div>}
    {deleting && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/40 p-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] bg-white p-7 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5"/></div><h2 className="mt-5 text-xl font-semibold">Delete {deleting.name}?</h2><p className="mt-2 text-sm leading-6 text-zinc-500">This will remove the item and immediately update your totals. This action cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setDeleting(null)} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button onClick={remove} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">Delete item</button></div></div></div>}
  </main>;
}

function DarkStat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-medium text-zinc-400">{label}</p><p className="mt-2 text-xl font-semibold">{money.format(value)}</p></div>; }
function FlowCard({ icon: Icon, label, value, tone, signed = false }: { icon: typeof Banknote; label: string; value: number; tone: string; signed?: boolean }) { const positive = tone === "emerald"; return <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><Icon className="h-5 w-5"/></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${signed ? positive ? "text-emerald-600" : "text-rose-600" : ""}`}>{signed && value > 0 ? "+" : ""}{money.format(value)}</p></div>; }

function ItemSection({ title, subtitle, icon: Icon, items, onEdit, onDelete, recurring = false }: { title: string; subtitle: string; icon: typeof Banknote; items: FinanceItem[]; onEdit: (kind: Kind, item: FinanceItem) => void; onDelete: (item: FinanceItem) => void; recurring?: boolean }) { return <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><Icon className="h-5 w-5"/></div><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-zinc-400">{subtitle}</p></div></div><div className="mt-5 divide-y divide-zinc-100">{items.length ? items.map((item) => <div key={item.id} className="group flex items-center gap-3 py-4 first:pt-1 last:pb-0"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.kind === "income" ? "bg-emerald-50 text-emerald-600" : item.kind === "expense" ? "bg-rose-50 text-rose-600" : "bg-zinc-50 text-zinc-500"}`}>{item.kind === "income" ? <ArrowDownLeft className="h-4 w-4"/> : item.kind === "expense" ? <ArrowUpRight className="h-4 w-4"/> : <Landmark className="h-4 w-4"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-zinc-400">{recurring ? kindLabels[item.kind] : item.category || kindLabels[item.kind]}{item.rate !== undefined ? ` · ${item.rate}% p.a.` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold">{money.format(item.amount)}{recurring && <span className="font-normal text-zinc-400"> / {item.frequency?.toLowerCase()}</span>}</p></div><div className="flex opacity-60 transition group-hover:opacity-100"><button aria-label={`Edit ${item.name}`} onClick={() => onEdit(item.kind, item)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4"/></button><button aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div></div>) : <p className="py-8 text-center text-sm text-zinc-400">Nothing here yet.</p>}</div></section>; }

function FinanceForm({ kind, item, onSubmit }: { kind: Kind; item: FinanceItem | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const balance = kind === "liability"; const recurring = kind === "income" || kind === "expense"; const categories = balance ? liabilityCategories : assetCategories; return <form onSubmit={onSubmit} className="mt-6 space-y-4"><Field label="Name *"><input name="name" required defaultValue={item?.name} placeholder={`e.g. ${kind === "asset" ? "Savings Account" : kind === "liability" ? "Credit Card" : kind === "income" ? "Salary" : "Living Expenses"}`} className="input"/></Field><Field label={`${balance ? "Balance" : "Amount"} *`}><div className="relative"><span className="absolute left-4 top-3 text-zinc-400">$</span><input name="amount" type="number" min="0" step="0.01" required defaultValue={item?.amount} className="input pl-8"/></div></Field>{!recurring ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><select name="category" defaultValue={item?.category} className="input">{categories.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label={`${balance ? "Interest" : "Interest / growth"} rate`}><div className="relative"><input name="rate" type="number" min="0" step="0.01" defaultValue={item?.rate} placeholder="Optional" className="input pr-10"/><span className="absolute right-4 top-3 text-zinc-400">%</span></div></Field></div> : <><Field label="Frequency *"><select name="frequency" required defaultValue={item?.frequency || "Monthly"} className="input">{frequencies.map((value) => <option key={value}>{value}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Start date"><input name="startDate" type="date" defaultValue={item?.startDate} className="input"/></Field><Field label="End date"><input name="endDate" type="date" defaultValue={item?.endDate} className="input"/></Field></div></>}<Field label="Notes"><textarea name="notes" rows={3} defaultValue={item?.notes} placeholder="Optional details" className="input resize-none"/></Field><button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800">{item ? "Save changes" : `Add ${kindLabels[kind]}`}</button></form>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-zinc-700">{label}</span>{children}</label>; }
