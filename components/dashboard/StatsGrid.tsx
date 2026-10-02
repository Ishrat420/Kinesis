"use client";

import Link from "next/link";
import { Calendar, CheckSquare, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { AttentionItem } from "@/lib/data/attention";
import { NeedsAttentionCard } from "./NeedsAttentionCard";
import { useFormatPreferences } from "@/lib/format/context";
import { formatMoney } from "@/lib/format/numbers";
import { MILESTONES_DUE_SOON_HREF, milestoneDueSoonLabel } from "@/lib/goals/milestone-window";
import { STAT_TILE_BODY_CLASS, STAT_TILE_CLASS, STAT_TILE_HEADER_CLASS, STAT_TILE_ICON_BOX_CLASS, STAT_TILE_ICON_CLASS, STAT_TILE_LABEL_CLASS, STAT_TILE_SEE_ALL_CLASS, STAT_TILE_TITLE_CLASS, STAT_TILE_VALUE_CLASS } from "./stat-tile-styles";

export function StatsGrid({ milestonesDueSoon, milestoneLeadDays, expiringSoon, attentionItems, goalsAtRisk, netCashFlow }: { milestonesDueSoon: number; milestoneLeadDays: number; expiringSoon: number; attentionItems: AttentionItem[]; goalsAtRisk: number; netCashFlow: number }) {
  const { locale, currency } = useFormatPreferences();
  const stats = [
    { icon: Calendar, title: "Expiring soon", value: String(expiringSoon), label: "documents", tone: "bg-blue-50", href: "/documents/expiring-soon" },
    // "See all" carries the same window the number was counted with, so the page lists exactly what the tile counted.
    { icon: CheckSquare, title: "Milestones", value: String(milestonesDueSoon), label: `due within ${milestoneDueSoonLabel(milestoneLeadDays)}`, tone: "bg-violet-50", href: MILESTONES_DUE_SOON_HREF },
    { icon: Target, title: "Goals at risk", value: String(goalsAtRisk), label: "on risk", tone: "bg-violet-50", href: "/goals?filter=at-risk" },
    { icon: netCashFlow < 0 ? TrendingDown : TrendingUp, title: "This month", value: formatMoney(netCashFlow, locale, currency), label: "net cash flow", tone: "bg-teal-50", href: "/finance" },
  ];
  // On a phone: compact tiles two to a row (Needs attention across the top),
  // instead of five full-width cards a screen and a half tall. The whole tile
  // is the link, so "See all" is left to wider screens. From sm up, as before.
  return <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
    <NeedsAttentionCard items={attentionItems} />
    {stats.map((stat) => { const Icon = stat.icon; return <Link key={stat.title} href={stat.href} className={STAT_TILE_CLASS}><div className={STAT_TILE_HEADER_CLASS}><div className={`${STAT_TILE_ICON_BOX_CLASS} ${stat.tone}`}><Icon className={STAT_TILE_ICON_CLASS} /></div><p className={STAT_TILE_TITLE_CLASS}>{stat.title}</p></div><div className={STAT_TILE_BODY_CLASS}><p className={STAT_TILE_VALUE_CLASS}>{stat.value}</p><p className={STAT_TILE_LABEL_CLASS}>{stat.label}</p></div><p className={STAT_TILE_SEE_ALL_CLASS}>See all →</p></Link>; })}
  </div>;
}
