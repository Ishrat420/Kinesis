"use server";

import { revalidatePath } from "next/cache";
import { addActivity } from "@/lib/data/activity";
import { isCalendarDate, isFinanceFrequency, isFinanceKind } from "@/lib/finance";
import type { FinanceItem, FinanceKind } from "@/lib/finance";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

export type FinanceActionState = { error?: string };

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

function validate(item: FinanceItem): string | null {
  if (!isFinanceKind(item.kind)) return "Choose a valid item type.";
  const name = item.name?.trim();
  if (!name) return "Enter a name.";
  if (name.length > 120) return "Keep the name under 120 characters.";
  if (typeof item.amount !== "number" || !Number.isFinite(item.amount)) return "Enter the amount as a number.";
  if (item.amount < 0) return "The amount cannot be negative.";
  if (item.rate !== undefined && (!Number.isFinite(item.rate) || item.rate < 0)) return "Enter the rate as a positive number.";
  if (item.category !== undefined && item.category.length > 60) return "Keep the category under 60 characters.";

  const recurring = item.kind === "income" || item.kind === "expense";
  if (recurring && !isFinanceFrequency(item.frequency)) return "Choose how often this repeats.";
  for (const [key, label] of [["startDate", "start date"], ["endDate", "end date"]] as const) {
    const value = item[key];
    if (value && !isCalendarDate(value)) return `Enter a valid ${label}.`;
  }
  if (item.startDate && item.endDate && item.endDate < item.startDate) return "The end date must be on or after the start date.";
  return null;
}

export async function saveFinanceItem(item: FinanceItem, updated: boolean): Promise<FinanceActionState> {
  const user = await requireKinesisUser();
  const error = validate(item);
  if (error) return { error };
  const name = item.name.trim();
  const data = { kind: item.kind, name, amount: item.amount, category: item.category?.trim() || null, rate: item.rate ?? null, frequency: item.frequency || null, startDate: date(item.startDate), endDate: date(item.endDate), notes: item.notes?.trim() || null };
  const existing = await prisma.financeItem.findFirst({ where: { id: item.id, userId: user.id }, select: { id: true } });
  if (existing) await prisma.$transaction(async (tx) => {
    const financeItem = await tx.financeItem.update({ where: { id: item.id }, data });
    await tx.object.update({ where: { id: financeItem.objectId }, data: { name } });
  });
  else await prisma.financeItem.create({ data: { id: item.id, user: { connect: { id: user.id } }, ...data, object: { create: { type: "FINANCE_ITEM" as const, name, userId: user.id } } } });
  await recordFinanceActivity(item.kind, updated, name);
  revalidatePath("/finance");
  return {};
}

export async function deleteFinanceItem(id: string) {
  const user = await requireKinesisUser();
  const item = await prisma.financeItem.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (item) await prisma.object.delete({ where: { id: item.objectId } });
  revalidatePath("/", "layout");
}
