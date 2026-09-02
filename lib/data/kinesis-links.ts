import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder, type KinesisLinkOption, type KinesisLinkTargetType } from "@/lib/custom-fields/types";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";

/** Narrows a located object to one a Kinesis Link is allowed to point at. */
const isLinkTarget = (location: ObjectLocation): location is ObjectLocation & { type: KinesisLinkTargetType } =>
  KINESIS_LINK_TARGET_TYPES.some((type) => type === location.type);

/**
 * A link stores an object id and nothing else. The module a target belongs to
 * still decides how it is presented and where it opens, so that mapping lives
 * in lib/objects/locations rather than in the column -- and is shared with every
 * other surface that offers objects to point at.
 */
export async function getKinesisLinkOptions(): Promise<KinesisLinkOption[]> {
  const objects = await prisma.object.findMany({
    where: { userId: (await requireKinesisUser()).id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
    select: objectLocationSelect,
    orderBy: { name: "asc" },
  });
  // Documents, then custom items, then goals, each already by name: the order the
  // picker has always grouped its modules in, read from each type's own `order`.
  return locateObjects(objects)
    .filter(isLinkTarget)
    .sort((first, second) => kinesisLinkTargetOrder(first.type) - kinesisLinkTargetOrder(second.type));
}

/** The foreign key keeps links pointing at something real; this keeps them pointing at something of yours. */
export async function validateKinesisTargets(targets: Array<{ targetObjectId?: string | null }>) {
  const user = await requireKinesisUser();
  const targetIds = [...new Set(targets.flatMap(({ targetObjectId }) => (targetObjectId ? [targetObjectId] : [])))];
  if (!targetIds.length) return;
  const owned = await prisma.object.count({
    where: { id: { in: targetIds }, userId: user.id, type: { in: [...KINESIS_LINK_TARGET_TYPES] } },
  });
  if (owned !== targetIds.length) throw new Error("Linked object not found");
}
