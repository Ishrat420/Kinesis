"use client";

import { Landmark } from "lucide-react";
import { getFinanceBalance } from "@/lib/finance";
import type { FinanceItem } from "@/lib/finance";

import { useFormatPreferences } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";
import { ModuleCard } from "./ModuleCard";

export function FinanceModuleCard({ items }: { items: FinanceItem[] }) {
  const { locale, currency } = useFormatPreferences();
  const balance = getFinanceBalance(items);

  return (
    <ModuleCard
      icon={Landmark}
      tone={{ className: "bg-emerald-50" }}
      name="Finance"
      href="/finance"
      meta={`${formatMoney(balance.netWorth, locale, currency)} net worth`}
      detail={`${formatMoney(balance.liabilities, locale, currency)} liabilities`}
    />
  );
}
