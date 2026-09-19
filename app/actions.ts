"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";
import { parseDismissalKey, type DismissibleKind } from "@/lib/attention/dismissal";
import { notificationKey } from "@/lib/notifications/identity";
import { formatDateInput } from "@/lib/dates";
import { getToday } from "@/lib/format/server";
import { getNextOccurrence } from "@/lib/relationships/occurrence";
import { locateObjects, objectLocationSelect } from "@/lib/objects/locations";
import { objectPairKey } from "@/lib/objects/relationships";
import { CUSTOM_KINESIS_LINK_OPTION_VALUE, parseKinesisLinkDirectionValue } from "@/lib/objects/relationship-labels";
import { recordRelationshipAdded, recordRelationshipChanged, recordRelationshipRemoved } from "@/lib/data/object-events";

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

export type KinesisLinkActionState = { error?: string };

/**
 * Every page an Object could be showing its own Kinesis Links on, revalidated
 * together -- a link's two ends are rarely both open at once, but the one
 * that isn't should still be fresh on the next visit rather than lagging
 * behind until something else happens to revalidate it.
 */
async function revalidateKinesisLinkEndpoints(objectIds: string[], userId: string) {
  const objects = await prisma.object.findMany({ where: { id: { in: objectIds }, userId }, select: objectLocationSelect });
  for (const location of locateObjects(objects)) revalidatePath(location.href);
}

/**
 * Reads the picker's submitted value into a type/direction, `CUSTOM`
 * included -- shared by add and update so the two can't quietly drift on how
 * a choice is parsed.
 */
function readKinesisLinkChoice(formData: FormData) {
  const directionValue = String(formData.get("direction") ?? "");
  const isCustom = directionValue === CUSTOM_KINESIS_LINK_OPTION_VALUE;
  const direction = isCustom ? { type: "CUSTOM" as const, inverse: false } : parseKinesisLinkDirectionValue(directionValue);
  if (!direction) return null;
  const customLabel = String(formData.get("customLabel") ?? "").trim();
  if (isCustom && !customLabel) return null;
  return { type: direction.type, inverse: direction.inverse, customLabel: isCustom ? customLabel : null };
}

/**
 * Adds a Kinesis Link from `objectId` to whatever the form's picker chose
 * (KD-049 Phase 2) -- the generalized form of the Goal-only
 * `addGoalRelationshipAction` (retired in Phase 4), usable from any Object's
 * own page rather than only a Goal's.
 */
export async function addKinesisLinkAction(objectId: string, _previousState: KinesisLinkActionState, formData: FormData): Promise<KinesisLinkActionState> {
  const user = await requireKinesisUser();
  const targetObjectId = String(formData.get("targetObjectId") ?? "").trim();
  if (!targetObjectId) return { error: "Choose something to link." };
  if (targetObjectId === objectId) return { error: "An object cannot be linked to itself." };

  const choice = readKinesisLinkChoice(formData);
  if (!choice) return { error: formData.get("direction") === CUSTOM_KINESIS_LINK_OPTION_VALUE ? "Type a label for this Kinesis Link." : "Choose a valid relationship." };

  const objects = await prisma.object.findMany({ where: { id: { in: [objectId, targetObjectId] }, userId: user.id }, select: { id: true, name: true } });
  if (objects.length !== 2) return { error: "One or both of these no longer exist." };
  const nameOf = (id: string) => objects.find((object) => object.id === id)!.name;

  const sourceObjectId = choice.inverse ? targetObjectId : objectId;
  const finalTargetObjectId = choice.inverse ? objectId : targetObjectId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.objectRelationship.create({
        data: {
          userId: user.id,
          sourceObjectId,
          targetObjectId: finalTargetObjectId,
          type: choice.type,
          customLabel: choice.customLabel,
          pairKey: objectPairKey(sourceObjectId, finalTargetObjectId),
        },
      });
      await recordRelationshipAdded(tx, {
        userId: user.id,
        source: { objectId: sourceObjectId, name: nameOf(sourceObjectId) },
        target: { objectId: finalTargetObjectId, name: nameOf(finalTargetObjectId) },
        type: choice.type,
        customLabel: choice.customLabel,
      });
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { error: "These are already linked this way." };
    throw error;
  }
  await revalidateKinesisLinkEndpoints([objectId, targetObjectId], user.id);
  return {};
}

/** Changes an existing Kinesis Link's type or custom label, keeping which two Objects it connects. */
export async function updateKinesisLinkAction(objectId: string, relationshipId: string, formData: FormData): Promise<void> {
  const user = await requireKinesisUser();
  const relationship = await prisma.objectRelationship.findFirst({
    where: { id: relationshipId, userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] },
    include: { sourceObject: { select: { name: true } }, targetObject: { select: { name: true } } },
  });
  if (!relationship) return;

  const choice = readKinesisLinkChoice(formData);
  if (!choice) return;

  const otherObjectId = relationship.sourceObjectId === objectId ? relationship.targetObjectId : relationship.sourceObjectId;
  const nameOf = (id: string) => (id === relationship.sourceObjectId ? relationship.sourceObject.name : relationship.targetObject.name);
  const sourceObjectId = choice.inverse ? otherObjectId : objectId;
  const targetObjectId = choice.inverse ? objectId : otherObjectId;

  await prisma.$transaction(async (tx) => {
    await tx.objectRelationship.update({
      where: { id: relationshipId },
      data: { sourceObjectId, targetObjectId, type: choice.type, customLabel: choice.customLabel, pairKey: objectPairKey(sourceObjectId, targetObjectId) },
    });
    await recordRelationshipChanged(tx, {
      userId: user.id,
      source: { objectId: sourceObjectId, name: nameOf(sourceObjectId) },
      target: { objectId: targetObjectId, name: nameOf(targetObjectId) },
      oldType: relationship.type,
      oldCustomLabel: relationship.customLabel,
      newType: choice.type,
      newCustomLabel: choice.customLabel,
    });
  });
  await revalidateKinesisLinkEndpoints([objectId, otherObjectId], user.id);
}

/** Removes a Kinesis Link -- deleting the row itself, never either Object it connected. */
export async function removeKinesisLinkAction(objectId: string, relationshipId: string): Promise<void> {
  const user = await requireKinesisUser();
  const relationship = await prisma.objectRelationship.findFirst({
    where: { id: relationshipId, userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] },
    include: { sourceObject: { select: { name: true } }, targetObject: { select: { name: true } } },
  });
  if (!relationship) return;
  const otherObjectId = relationship.sourceObjectId === objectId ? relationship.targetObjectId : relationship.sourceObjectId;
  await prisma.$transaction(async (tx) => {
    await tx.objectRelationship.delete({ where: { id: relationshipId } });
    await recordRelationshipRemoved(tx, {
      userId: user.id,
      source: { objectId: relationship.sourceObjectId, name: relationship.sourceObject.name },
      target: { objectId: relationship.targetObjectId, name: relationship.targetObject.name },
      type: relationship.type,
      customLabel: relationship.customLabel,
    });
  });
  await revalidateKinesisLinkEndpoints([objectId, otherObjectId], user.id);
}
