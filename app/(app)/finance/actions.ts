"use server";

import { revalidatePath } from "next/cache";
import { addActivity } from "@/lib/data/activity";
import { isCalendarDate, isFinanceFrequency, isFinanceKind } from "@/lib/finance";
import type { FinanceFrequency, FinanceItem, FinanceKind } from "@/lib/finance";
import { parseDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";
import { deleteObjects, objectFor } from "@/lib/data/objects";

export type FinanceActionState = { error?: string; saved?: boolean };

const SAVE_FAILED = "Something went wrong saving this item. Please try again.";
const DELETE_FAILED = "Something went wrong deleting this item. Please try again.";

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

// `validate` below has already confirmed `isCalendarDate` for any value
// reaching here, so `parseDateOnly` -- the one shared "yyyy-mm-dd -> UTC
// date" parser -- never returns null in practice.
function date(value?: string) {
  return value ? parseDateOnly(value) : null;
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
  if (existing) await prisma.financeItem.update({ where: { id: item.id }, data });
  else await prisma.financeItem.create({ data: { id: item.id, user: { connect: { id: user.id } }, ...data, object: objectFor.financeItem(name, user.id) } });
  await recordFinanceActivity(item.kind, updated, name);
  revalidatePath("/finance");
  return { saved: true };
}

export async function deleteFinanceItem(id: string) {
  const user = await requireKinesisUser();
  const item = await prisma.financeItem.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (item) await deleteObjects(prisma, [item.objectId], user.id);
  revalidatePath("/", "layout");
}

/**
 * Reads the finance form.
 *
 * The kind, and the id of the item being edited, are bound by the caller
 * because neither is a field the person fills in; everything else comes off
 * the form here rather than being assembled in the browser and posted as an
 * object, which is what let the dashboard render a client-built item that only
 * resembled what was actually stored.
 */
function financeItemFrom(kind: FinanceKind, existingId: string | null, formData: FormData): FinanceItem {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const item: FinanceItem = {
    id: existingId ?? crypto.randomUUID(),
    kind,
    name: value("name"),
    amount: Number(formData.get("amount")),
    notes: value("notes"),
  };
  if (kind === "income" || kind === "expense") {
    item.frequency = value("frequency") as FinanceFrequency;
    item.startDate = value("startDate");
    item.endDate = value("endDate");
  } else {
    item.category = value("category");
    const rate = value("rate");
    if (rate !== "") item.rate = Number(rate);
  }
  return item;
}

/**
 * The form's entry point, in the shape `useActionState` binds to.
 *
 * A fault -- an ownership violation, a database that is down -- is turned into
 * a sentence the form can render rather than being left to the error boundary,
 * because the dialog it happened in is still open and still holds what the
 * person typed.
 */
export async function saveFinanceItemAction(kind: FinanceKind, existingId: string | null, _previousState: FinanceActionState, formData: FormData): Promise<FinanceActionState> {
  if (!isFinanceKind(kind)) return { error: "Choose a valid item type." };
  try {
    return await saveFinanceItem(financeItemFrom(kind, existingId, formData), existingId !== null);
  } catch {
    return { error: SAVE_FAILED };
  }
}

export async function deleteFinanceItemAction(id: string): Promise<FinanceActionState> {
  try {
    await deleteFinanceItem(id);
    return { saved: true };
  } catch {
    return { error: DELETE_FAILED };
  }
}
