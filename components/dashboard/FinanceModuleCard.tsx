"use client";

import { Landmark } from "lucide-react";
import { getFinanceBalance } from "@/lib/finance";
import type { FinanceItem } from "@/lib/finance";

import { useFormatPreferences, useToday } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";
import { ModuleCard } from "./ModuleCard";
import type { ModuleCardProps } from "./ModuleCard";

export function FinanceModuleCard({ items, gripHandlers }: { items: FinanceItem[]; gripHandlers?: ModuleCardProps["gripHandlers"] }) {
  const { locale, currency } = useFormatPreferences();
  const today = useToday();
  const balance = getFinanceBalance(items, today);

  return (
    <ModuleCard
      icon={Landmark}
      tone={{ className: "bg-emerald-50" }}
      name="Finance"
      href="/finance"
      meta={`${formatMoney(balance.netWorth, locale, currency)} net worth`}
      detail={`${formatMoney(balance.liabilities, locale, currency)} liabilities`}
      gripHandlers={gripHandlers}
    />
  );
}
