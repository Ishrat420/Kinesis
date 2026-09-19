import type { ObjectRelationshipType } from "@prisma/client";
import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { locateObject, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { kinesisLinkLabel } from "@/lib/objects/relationship-labels";

/** One Kinesis Link, already resolved from the current Object's own side (KD-049). */
export type KinesisLink = {
  id: string;
  type: ObjectRelationshipType;
  customLabel: string | null;
  /** Whether this Object is stored as the relationship's target rather than its source -- decides which of the forward/inverse labels `label` already is. */
  inverse: boolean;
  /** The resolved Kinesis Link label, from this Object's side -- never "source"/"target" language. */
  label: string;
  /** The other Object this Kinesis Link points at. */
  target: ObjectLocation;
};

/**
 * Every Kinesis Link touching this Object, read from its own point of view --
 * grouping by `label` (see `groupKinesisLinksByLabel`) is a presentation
 * concern for the caller, not this function's job. A row whose other side has
 * no locatable record left (deleted, or a type `locateObject` doesn't know)
 * is skipped rather than shown as a broken card.
 */
export async function getKinesisLinks(objectId: string): Promise<KinesisLink[]> {
  const user = await requireKinesisUser();
  const relationships = await prisma.objectRelationship.findMany({
    where: { userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] },
    include: { sourceObject: { select: objectLocationSelect }, targetObject: { select: objectLocationSelect } },
    orderBy: { createdAt: "asc" },
  });
  return relationships.flatMap((relationship) => {
    const inverse = relationship.targetObjectId === objectId;
    const target = locateObject(inverse ? relationship.sourceObject : relationship.targetObject);
    if (!target) return [];
    return [{
      id: relationship.id,
      type: relationship.type,
      customLabel: relationship.customLabel,
      inverse,
      label: kinesisLinkLabel(relationship.type, relationship.customLabel, inverse),
      target,
    }];
  });
}
