"use client";

import Link from "next/link";
import { Calendar, CheckSquare, Flag, Target, TrendingUp } from "lucide-react";
import { getMonthlyCashFlow } from "@/lib/finance";
import { useFinanceItems } from "@/lib/useFinanceItems";

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function StatsGrid({
  milestonesDueSoon,
  expiringSoon,
}: {
  milestonesDueSoon: number;
  expiringSoon: number;
}) {
  const items = useFinanceItems();
  const { netCashFlow } = getMonthlyCashFlow(items);
  const stats = [
    { icon: Flag, title: "Needs attention", value: "5", label: "items", tone: "bg-amber-50", href: "#" },
    { icon: Calendar, title: "Expiring soon", value: String(expiringSoon), label: "documents", tone: "bg-blue-50", href: "/documents/expiring-soon" },
    { icon: CheckSquare, title: "Milestones", value: String(milestonesDueSoon), label: "due within one month", tone: "bg-emerald-50", href: "/goals/milestones/due-soon" },
    { icon: Target, title: "Goals progress", value: "2", label: "on track", tone: "bg-violet-50", href: "/goals" },
    { icon: TrendingUp, title: "This month", value: money.format(netCashFlow), label: "net cash flow", tone: "bg-teal-50", href: "/finance" },
  ];

  return <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    {stats.map((stat) => { const Icon = stat.icon; return <Link key={stat.title} href={stat.href} className="group rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)]">
      <div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${stat.tone}`}><Icon className="h-[18px] w-[18px] text-zinc-700" /></div><p className="text-sm font-semibold text-zinc-700">{stat.title}</p></div>
      <div className="mt-6"><p className="text-[38px] font-semibold leading-none tracking-tight">{stat.value}</p><p className="mt-2 text-sm text-zinc-500">{stat.label}</p></div>
      <p className="mt-6 text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900">See all →</p>
    </Link>; })}
  </div>;
}
