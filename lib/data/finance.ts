import { connection } from "next/server";
import { prisma } from "./prisma";
import type { FinanceFrequency, FinanceItem, FinanceKind } from "@/lib/finance";
import { requireKinesisUser } from "@/lib/auth";
import type { FinanceItem as FinanceItemRow } from "@prisma/client";

function mapFinanceItem(item: FinanceItemRow): FinanceItem {
  return {
    id: item.id,
    kind: item.kind as FinanceKind,
    name: item.name,
    amount: item.amount,
    category: item.category ?? undefined,
    rate: item.rate ?? undefined,
    monthlyContribution: item.monthlyContribution ?? undefined,
    balanceAsOf: item.balanceAsOf.toISOString().slice(0, 10),
    frequency: item.frequency as FinanceFrequency | undefined,
    startDate: item.startDate?.toISOString().slice(0, 10),
    endDate: item.endDate?.toISOString().slice(0, 10),
    notes: item.notes ?? undefined,
  };
}

export async function getFinanceItems(): Promise<FinanceItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const items = await prisma.financeItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return items.map(mapFinanceItem);
}

/** A Finance Item's full detail -- its Object identity and creation date, for its own detail page/History section (KD-048). */
export type FinanceItemDetail = FinanceItem & { objectId: string; createdAt: string };

export async function getFinanceItem(id: string): Promise<FinanceItemDetail | null> {
  await connection();
  const user = await requireKinesisUser();
  const item = await prisma.financeItem.findFirst({ where: { id, userId: user.id } });
  if (!item) return null;
  return { ...mapFinanceItem(item), objectId: item.objectId, createdAt: item.createdAt.toISOString() };
}
