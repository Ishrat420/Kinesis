"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { Modal } from "@/components/overlay/Modal";
import { ObjectHistory, type ObjectHistoryEntry } from "@/components/history/ObjectHistory";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import { formatDate } from "@/lib/dates";
import { type FinanceKind, getFinanceProjection, getLiabilityHealth, getMonthsToPayoff, getProjectedAmount } from "@/lib/finance";
import type { FinanceItemDetail } from "@/lib/data/finance";
import { DeleteFinanceItem, FinanceForm, FinanceHealthBadge, FinanceProjectionHistory, KIND_ICONS, KIND_TONE_CLASS, kindLabels, useMoney } from "./FinanceItemForm";

/** The section grouping each kind belongs to on the dashboard -- for the breadcrumb only, distinct from `kindLabels`' singular item label. */
const KIND_GROUP_LABEL: Record<FinanceKind, string> = {
  asset: "Assets", liability: "Liabilities", income: "Recurring income & expenses", expense: "Recurring income & expenses",
};

function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">{label}</p>
    <p className="mt-1.5 text-xl font-semibold text-zinc-900">{value}</p>
    {caption && <p className="mt-1 text-xs text-zinc-400">{caption}</p>}
  </div>;
}

/** The read-only stat row, health banner, auto-applied projection, and notes -- everything a save doesn't already put in `FinanceForm`. */
function FinanceItemFields({ item, today }: { item: FinanceItemDetail; today: Date }) {
  const money = useMoney();
  const { locale } = useFormatPreferences();
  const recurring = item.kind === "income" || item.kind === "expense";
  const liability = item.kind === "liability";
  const displayedAmount = recurring ? item.amount : getProjectedAmount(item, today);
  const projection = recurring ? [] : getFinanceProjection(item, today);
  const health = liability ? getLiabilityHealth(item, today) : undefined;
  const monthsToPayoff = liability ? getMonthsToPayoff(item, today) : undefined;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        label={recurring ? "Amount" : "Balance"}
        value={money(displayedAmount)}
        caption={recurring ? (item.frequency ? `per ${item.frequency.toLowerCase()}` : undefined) : item.balanceAsOf ? `as of ${formatDate(item.balanceAsOf, locale)}` : undefined}
      />
      {!recurring && item.rate !== undefined && <StatTile label="Interest rate" value={`${item.rate}%`} caption="p.a." />}
      {!recurring && item.monthlyContribution !== undefined && <StatTile label={liability ? "Monthly payment" : "Monthly contribution"} value={money(item.monthlyContribution)} />}
      {recurring && item.startDate && <StatTile label="Start date" value={formatDate(item.startDate, locale)} />}
      {recurring && item.endDate && <StatTile label="End date" value={formatDate(item.endDate, locale)} />}
    </div>
    {health && <FinanceHealthBadge health={health} monthsToPayoff={monthsToPayoff} />}
    {!recurring && <FinanceProjectionHistory entries={projection} balance={liability} />}
    {item.notes && <div><p className="mb-1.5 text-xs font-semibold text-zinc-500">Notes</p><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.notes}</p></div>}
  </div>;
}

/**
 * A Finance Item's own detail view (KD-048) -- read fields, an inline edit
 * toggle reusing the dashboard's own `FinanceForm`, and its History section.
 * Rendered two ways from the same component: as the real page at
 * `/finance/[itemId]` (`asModal` false, the default -- reached directly, by
 * refresh, or by a shared link), and as the "big window" intercepted route
 * at `app/(app)/@modal/(.)finance/[itemId]/page.tsx` (`asModal` true --
 * reached by clicking a row from the dashboard, so the URL still changes but
 * the dashboard stays mounted underneath).
 */
export function FinanceItemDetailView({ item, history, asModal = false }: { item: FinanceItemDetail; history: ObjectHistoryEntry[]; asModal?: boolean }) {
  const router = useRouter();
  const today = useToday();
  const { locale } = useFormatPreferences();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const Icon = KIND_ICONS[item.kind];
  const close = () => router.back();

  const meta = <>{kindLabels[item.kind]}{item.category ? <> · {item.category}</> : ""} · Added {formatDate(item.createdAt, locale)}</>;

  const actions = editing
    ? <button type="button" onClick={() => setEditing(false)} className="flex h-10 items-center rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50">Cancel</button>
    : <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(true)} className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:-translate-y-0.5"><Pencil className="h-4 w-4" />Edit</button>
        <button type="button" onClick={() => setDeleting(true)} className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:-translate-y-0.5"><Trash2 className="h-4 w-4" />Delete</button>
      </div>;

  const body = editing
    ? <FinanceForm kind={item.kind} item={item} onSaved={() => setEditing(false)} today={today} />
    : <FinanceItemFields item={item} today={today} />;

  const deleteModal = deleting && <DeleteFinanceItem item={item} onCancel={() => setDeleting(false)} onDeleted={() => router.push("/finance")} />;

  if (asModal) {
    return <>
      <Modal ariaLabel={item.name} onClose={close} customHeader panelClassName="sm:max-w-2xl relative">
        <button type="button" onClick={close} aria-label="Close dialog" className="absolute right-6 top-6 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button>
        <div className="flex items-start justify-between gap-4 pr-10">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${KIND_TONE_CLASS[item.kind]}`}><Icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Finance &nbsp;/&nbsp; {KIND_GROUP_LABEL[item.kind]}</p>
              <h1 className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-zinc-950">{item.name}</h1>
              <p className="mt-1 text-sm text-zinc-400">{meta}</p>
            </div>
          </div>
        </div>
        <div className="mt-5">{actions}</div>
        <div className="mt-6">{body}</div>
        {!editing && <div className="mt-5"><ObjectHistory entries={history} fallbackCreatedAt={item.createdAt} locale={locale} /></div>}
      </Modal>
      {deleteModal}
    </>;
  }

  return <ModuleContent>
    <ModuleHeader
      backHref="/finance"
      backLabel="Back to finance"
      breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: KIND_GROUP_LABEL[item.kind] }, { label: item.name }]}
      icon={<Icon className="h-5 w-5" />}
      iconClassName={KIND_TONE_CLASS[item.kind]}
      title={item.name}
      description={meta}
      actions={actions}
    />
    <div className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">{body}</div>
    {!editing && <div className="mt-5"><ObjectHistory entries={history} fallbackCreatedAt={item.createdAt} locale={locale} /></div>}
    {deleteModal}
  </ModuleContent>;
}
