"use server";

import { revalidatePath } from "next/cache";
import { addActivity } from "@/lib/data/activity";
import type { FinanceKind } from "@/lib/finance";
import type { FinanceItem } from "@/lib/finance";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

const labels: Record<FinanceKind, string> = {
  asset: "Asset",
  liability: "Liability",
  income: "Monthly income",
  expense: "Monthly expenses",
};

export async function recordFinanceActivity(kind: FinanceKind, updated: boolean, name: string) {
  await addActivity({
    action: updated ? "Updated" : "Added",
    moduleName: "Finance",
    objectName: kind === "income" || kind === "expense" ? labels[kind] : name,
    icon: "finance",
    href: "/finance",
  });
  revalidatePath("/");
}

function date(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function saveFinanceItem(item: FinanceItem, updated: boolean) {
  const user = await requireKinesisUser();
  const data = { kind: item.kind, name: item.name, amount: item.amount, category: item.category || null, rate: item.rate ?? null, frequency: item.frequency || null, startDate: date(item.startDate), endDate: date(item.endDate), notes: item.notes || null };
  const existing = await prisma.financeItem.findFirst({ where: { id: item.id, userId: user.id }, select: { id: true } });
  if (existing) await prisma.financeItem.update({ where: { id: item.id }, data });
  else await prisma.financeItem.create({ data: { id: item.id, userId: user.id, ...data } });
  await recordFinanceActivity(item.kind, updated, item.name);
  revalidatePath("/finance");
}

export async function deleteFinanceItem(id: string) {
  const user = await requireKinesisUser();
  await prisma.financeItem.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/", "layout");
}
