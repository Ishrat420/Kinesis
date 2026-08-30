"use client";

import { GripVertical, Landmark } from "lucide-react";
import Link from "next/link";
import {
  getFinanceBalance,
} from "@/lib/finance";
import type { FinanceItem } from "@/lib/finance";

import { useFormatPreferences } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";

export function FinanceModuleCard({ items }: { items: FinanceItem[] }) {
  const { locale, currency } = useFormatPreferences();
  const balance = getFinanceBalance(items);

  return (
    <Link
      href="/finance"
      className="group relative block h-full rounded-2xl border border-zinc-200/80 bg-white p-4 pb-10 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
          <Landmark className="h-[18px] w-[18px] text-zinc-700" />
        </div>
        <GripVertical className="h-5 w-5 cursor-grab text-zinc-300" aria-label="Drag Finance" />
      </div>
      <p className="mt-4 font-semibold text-zinc-900">Finance</p>
      <p className="mt-1 text-sm text-zinc-500">{formatMoney(balance.netWorth, locale, currency)} net worth</p>
      <p className="text-sm text-zinc-400">{formatMoney(balance.liabilities, locale, currency)} liabilities</p>
      <span className="absolute bottom-4 right-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
    </Link>
  );
}
