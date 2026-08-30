"use client";

import Link from "next/link";
import { Calendar, CheckSquare, Target, TrendingUp } from "lucide-react";
import type { AttentionItem } from "@/lib/data/attention";
import { NeedsAttentionCard } from "./NeedsAttentionCard";
import { useFormatPreferences } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";

export function StatsGrid({ milestonesDueSoon, expiringSoon, attentionItems, goalsAtRisk, netCashFlow }: { milestonesDueSoon: number; expiringSoon: number; attentionItems: AttentionItem[]; goalsAtRisk: number; netCashFlow: number }) {
  const { locale, currency } = useFormatPreferences();
  const stats = [
    { icon: Calendar, title: "Expiring soon", value: String(expiringSoon), label: "documents", tone: "bg-blue-50", href: "/documents/expiring-soon" },
    { icon: CheckSquare, title: "Milestones", value: String(milestonesDueSoon), label: "due within one month", tone: "bg-emerald-50", href: "/goals/milestones/due-soon" },
    { icon: Target, title: "Goals at risk", value: String(goalsAtRisk), label: "on risk", tone: "bg-violet-50", href: "/goals?filter=at-risk" },
    { icon: TrendingUp, title: "This month", value: formatMoney(netCashFlow, locale, currency), label: "net cash flow", tone: "bg-teal-50", href: "/finance" },
  ];
  return <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    <NeedsAttentionCard items={attentionItems} />
    {stats.map((stat) => { const Icon = stat.icon; return <Link key={stat.title} href={stat.href} className="group rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)]"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${stat.tone}`}><Icon className="h-[18px] w-[18px] text-zinc-700" /></div><p className="text-sm font-semibold text-zinc-700">{stat.title}</p></div><div className="mt-6"><p className="text-[38px] font-semibold leading-none tracking-tight">{stat.value}</p><p className="mt-2 text-sm text-zinc-500">{stat.label}</p></div><p className="mt-6 text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900">See all →</p></Link>; })}
  </div>;
}
