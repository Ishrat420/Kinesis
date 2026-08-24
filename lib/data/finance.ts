import { connection } from "next/server";
import { prisma } from "./prisma";
import type { FinanceFrequency, FinanceItem, FinanceKind } from "@/lib/finance";

export async function getFinanceItems(): Promise<FinanceItem[]> {
  await connection();
  const items = await prisma.financeItem.findMany({ orderBy: { createdAt: "asc" } });
  return items.map((item) => ({
    id: item.id,
    kind: item.kind as FinanceKind,
    name: item.name,
    amount: item.amount,
    category: item.category ?? undefined,
    rate: item.rate ?? undefined,
    frequency: item.frequency as FinanceFrequency | undefined,
    startDate: item.startDate?.toISOString().slice(0, 10),
    endDate: item.endDate?.toISOString().slice(0, 10),
    notes: item.notes ?? undefined,
  }));
}
