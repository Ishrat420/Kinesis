"use client";

import { Landmark } from "lucide-react";
import Link from "next/link";
import {
  getFinanceBalance,
} from "@/lib/finance";
import { useFinanceItems } from "@/lib/useFinanceItems";

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function FinanceModuleCard() {
  const items = useFinanceItems();
  const balance = getFinanceBalance(items);

  return (
    <Link
      href="/finance"
      className="group block h-full rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
          <Landmark className="h-[18px] w-[18px] text-zinc-700" />
        </div>
        <span className="text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
      </div>
      <p className="mt-4 font-semibold text-zinc-900">Finance</p>
      <p className="mt-1 text-sm text-zinc-500">{money.format(balance.netWorth)} net worth</p>
      <p className="text-sm text-zinc-400">{money.format(balance.liabilities)} liabilities</p>
    </Link>
  );
}
