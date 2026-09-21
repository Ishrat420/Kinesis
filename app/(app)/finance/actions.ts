"use server";

import { revalidatePath } from "next/cache";
import { isCalendarDate, isFinanceFrequency, isFinanceKind } from "@/lib/finance";
import type { FinanceFrequency, FinanceItem, FinanceKind } from "@/lib/finance";
import { parseDateOnly } from "@/lib/dates";
import { getToday } from "@/lib/format/server";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";
import { deleteObjects, objectFor } from "@/lib/data/objects";
import { revalidateShell } from "@/lib/actions/revalidate";
import { recordEvent, recordFieldChanges, type FieldChange } from "@/lib/data/object-events";
import { formatDateInput } from "@/lib/dates";
import { checkLength, checkNumberMagnitude, NOTES_LIMIT, TEXT_LIMIT } from "@/lib/validation/field-limits";

export type FinanceActionState = { error?: string; saved?: boolean };

const SAVE_FAILED = "Something went wrong saving this item. Please try again.";
const DELETE_FAILED = "Something went wrong deleting this item. Please try again.";

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
  if (item.monthlyContribution !== undefined && (!Number.isFinite(item.monthlyContribution) || item.monthlyContribution < 0)) return "Enter the monthly amount as a positive number.";
  const magnitudeError = checkNumberMagnitude(item.amount, "the amount")
    ?? checkNumberMagnitude(item.rate, "the rate")
    ?? checkNumberMagnitude(item.monthlyContribution, "the monthly amount");
  if (magnitudeError) return magnitudeError;
  const textError = checkLength(item.category, TEXT_LIMIT, "the category") ?? checkLength(item.notes, NOTES_LIMIT, "the notes");
  if (textError) return textError;

  const recurring = item.kind === "income" || item.kind === "expense";
  if (recurring && !isFinanceFrequency(item.frequency)) return "Choose how often this repeats.";
  for (const [key, label] of [["startDate", "start date"], ["endDate", "end date"]] as const) {
    const value = item[key];
    if (value && !isCalendarDate(value)) return `Enter a valid ${label}.`;
  }
  if (item.startDate && item.endDate && item.endDate < item.startDate) return "The end date must be on or after the start date.";
  return null;
}

/** A Finance Item column's value, formatted the same plain way every other stored value in this model is -- a date as `yyyy-mm-dd`, a number as its decimal string, everything else as-is. */
function financeColumnValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return formatDateInput(value);
  return String(value);
}

/** The Finance Item columns a save can change and that are worth their own History line. No status or archival concept exists here to map onto. */
const FINANCE_NAMED_FIELDS = [
  ["name", "Name"], ["amount", "Amount"], ["category", "Category"], ["rate", "Rate"], ["monthlyContribution", "Monthly contribution"],
  ["frequency", "Frequency"], ["startDate", "Start date"], ["endDate", "End date"], ["notes", "Notes"],
] as const;

export async function saveFinanceItem(item: FinanceItem): Promise<FinanceActionState> {
  const user = await requireKinesisUser();
  const error = validate(item);
  if (error) return { error };
  const name = item.name.trim();
  // KD-044: today becomes the new `balanceAsOf` on every save, not just one
  // that changes `amount` -- the amount the form submits is always the
  // owner's current confirmed number by construction (it was either typed
  // fresh or accepted as prefilled from the live projection), so there is
  // no case where "the number didn't change" should mean "don't restart the
  // accrual clock." See getFinanceProjection in lib/finance.ts. `balanceAsOf`
  // is exactly this kind of internal bookkeeping value -- always touched,
  // never itself a fact worth a History line -- so it's excluded from the
  // named-field diff below the same way `updatedAt` is everywhere else.
  const data = { kind: item.kind, name, amount: item.amount, category: item.category?.trim() || null, rate: item.rate ?? null, monthlyContribution: item.monthlyContribution ?? null, balanceAsOf: await getToday(), frequency: item.frequency || null, startDate: date(item.startDate), endDate: date(item.endDate), notes: item.notes?.trim() || null };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.financeItem.findFirst({
      where: { id: item.id, userId: user.id },
      select: { objectId: true, name: true, amount: true, category: true, rate: true, monthlyContribution: true, frequency: true, startDate: true, endDate: true, notes: true },
    });
    if (existing) {
      await tx.financeItem.update({ where: { id: item.id }, data });
      const changes: FieldChange[] = FINANCE_NAMED_FIELDS
        .filter(([key]) => financeColumnValue(existing[key]) !== financeColumnValue(data[key]))
        .map(([key, label]) => ({ fieldKey: key, fieldLabel: label, oldValue: financeColumnValue(existing[key]), newValue: financeColumnValue(data[key]) }));
      await recordFieldChanges(tx, user.id, existing.objectId, changes);
    } else {
      const created = await tx.financeItem.create({ data: { id: item.id, user: { connect: { id: user.id } }, ...data, object: objectFor.financeItem(name, user.id) } });
      await recordEvent(tx, user.id, created.objectId, "ITEM_CREATED");
    }
  });
  revalidateShell();
  revalidatePath("/finance");
  return { saved: true };
}

export async function deleteFinanceItem(id: string) {
  const user = await requireKinesisUser();
  const item = await prisma.financeItem.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (item) await deleteObjects(prisma, [item.objectId], user.id);
  revalidateShell();
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
    const monthlyContribution = value("monthlyContribution");
    if (monthlyContribution !== "") item.monthlyContribution = Number(monthlyContribution);
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
    return await saveFinanceItem(financeItemFrom(kind, existingId, formData));
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
