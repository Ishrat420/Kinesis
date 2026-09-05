"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";
import { parseDismissalKey, type DismissibleKind } from "@/lib/attention/dismissal";
import { formatDateInput } from "@/lib/dates";

/** The column that links a dismissal, and its notifications, back to the record. */
const LINK_FIELD = {
  document: "documentId",
  custom: "customItemId",
  todo: "todoId",
} as const satisfies Record<DismissibleKind, string>;

/**
 * The deadline a dismissal is measured against, read straight from the record.
 *
 * Returning null means there is nothing to dismiss: the record is gone, it
 * belongs to someone else, or it no longer carries a date at all.
 */
async function currentDeadline(kind: DismissibleKind, id: string, userId: string) {
  if (kind === "document") {
    const document = await prisma.document.findFirst({ where: { id, userId }, select: { expiryDate: true } });
    return document?.expiryDate ?? null;
  }
  if (kind === "custom") {
    const item = await prisma.customItem.findFirst({ where: { id, module: { userId } }, select: { dueDate: true } });
    return item?.dueDate ?? null;
  }
  const todo = await prisma.todo.findFirst({ where: { id, userId }, select: { dueDate: true } });
  return todo?.dueDate ?? null;
}

/**
 * Hides one Needs Attention row until its deadline changes.
 *
 * The key names the item *and* the date the person was looking at, so the
 * dismissal is only ever recorded against that deadline. Editing the date makes
 * the stored key stop matching, which is the whole mechanism -- there is no
 * expiry to tick down and nothing to clean up afterwards.
 *
 * Dismissing also marks the matching notification read: someone who has said
 * they are done seeing a row does not want it still bolded in the bell.
 */
export async function dismissAttentionItem(itemKey: string) {
  const parsed = parseDismissalKey(itemKey);
  if (!parsed) return;

  const user = await requireKinesisUser();
  const deadline = await currentDeadline(parsed.kind, parsed.id, user.id);
  // A date that has already moved on makes this dismissal meaningless: the row
  // the person clicked no longer exists at that deadline.
  if (!deadline || formatDateInput(deadline) !== parsed.date) return;

  const link = LINK_FIELD[parsed.kind];
  await prisma.$transaction([
    prisma.attentionDismissal.upsert({
      where: { userId_itemKey: { userId: user.id, itemKey } },
      update: {},
      create: { id: crypto.randomUUID(), userId: user.id, itemKey, [link]: parsed.id },
    }),
    prisma.notification.updateMany({
      where: { userId: user.id, [link]: parsed.id, readAt: null },
      data: { readAt: new Date() },
    }),
  ]);
  revalidatePath("/");
}
