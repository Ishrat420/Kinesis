"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";
import { parseDismissalKey, type DismissibleKind } from "@/lib/attention/dismissal";
import { notificationKey } from "@/lib/notifications/identity";
import { formatDateInput } from "@/lib/dates";
import { getToday } from "@/lib/format/server";
import { getNextOccurrence } from "@/lib/relationships/occurrence";

/** The column that links a dismissal, and its notifications, back to the record. */
const LINK_FIELD = {
  document: "documentId",
  custom: "customItemId",
  relationship: "relationshipDateId",
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
  if (kind === "relationship") {
    // A relationship date's deadline is never the stored `date` itself once
    // it repeats yearly -- it's whichever occurrence is still ahead, the same
    // value `lib/data/upcoming.ts` built the dismissed key's date from.
    const importantDate = await prisma.relationshipImportantDate.findFirst({
      where: { id, OR: [{ relationship: { userId } }, { selfPerson: { userId } }] },
      select: { date: true, repeatsYearly: true },
    });
    if (!importantDate) return null;
    return getNextOccurrence(importantDate, await getToday());
  }
  const item = await prisma.customItem.findFirst({ where: { id, module: { userId } }, select: { dueDate: true } });
  return item?.dueDate ?? null;
}

/**
 * Hides one Needs Attention or Upcoming & Due row until its deadline, or what
 * it is currently saying about that deadline, changes.
 *
 * The key names the item, the date the person was looking at, *and* which of
 * that record's two notices (an advance one, or the overdue one that later
 * replaces it) they dismissed -- see lib/attention/dismissal.ts. Editing the
 * date makes the stored key stop matching; reaching the deadline changes what
 * there is to say about it, which does the same, on its own, with no separate
 * bookkeeping. Either way there is no expiry to tick down and nothing to
 * clean up afterwards -- dismissing the advance notice for something still
 * "expiring soon" must not also silence its eventual "expired" notice, and
 * this is the whole mechanism that keeps the two independent.
 *
 * Dismissing also marks the matching notification read: someone who has said
 * they are done seeing a row does not want it still bolded in the bell --
 * "matching" being exactly the notice named in the key just parsed, not
 * whichever one this function assumes.
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
  // The bell derives what it shows, so there is no row here to mark read --
  // there is a marker to write, naming the exact notice the dismissed key
  // itself named.
  const readKey = notificationKey(parsed.kind, parsed.id, parsed.type, deadline);
  await prisma.$transaction([
    prisma.attentionDismissal.upsert({
      where: { userId_itemKey: { userId: user.id, itemKey } },
      update: {},
      create: { id: crypto.randomUUID(), userId: user.id, itemKey, [link]: parsed.id },
    }),
    // Hiding the row and quieting the bell stay one act, not two that can
    // half-apply.
    prisma.notificationRead.upsert({
      where: { userId_itemKey: { userId: user.id, itemKey: readKey } },
      update: {},
      create: { id: crypto.randomUUID(), userId: user.id, itemKey: readKey, [link]: parsed.id },
    }),
  ]);
  revalidatePath("/");
}
