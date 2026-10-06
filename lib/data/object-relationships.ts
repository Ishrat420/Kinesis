import type { ObjectRelationshipType } from "@prisma/client";
import { requireKinesisUser } from "@/lib/auth";
import { prisma } from "./prisma";
import { locateObject, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { kinesisLinkLabel } from "@/lib/objects/relationship-labels";
import { getKinesisLinkPreviews, getKinesisLinkRecentEvents, type KinesisLinkPreviewStat, type KinesisLinkRecentEvent } from "./kinesis-links";

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
  /** Whether this link is a custom item's value for a template Kinesis Link field (KD-023). Its type is the field's, so it can be removed but not retyped. */
  fromTemplateField: boolean;
};

/**
 * Every Kinesis Link touching this Object, read from its own point of view --
 * returned in one flat list (KD-049 §4); each link's `label` decorates its
 * own card (§3) rather than driving a grouped/heading presentation. A row
 * whose other side has no locatable record left (deleted, or a type
 * `locateObject` doesn't know) is skipped rather than shown as a broken card.
 */
export async function getKinesisLinks(objectId: string): Promise<KinesisLink[]> {
  const user = await requireKinesisUser();
  const relationships = await prisma.objectRelationship.findMany({
    // A template field's links from this object are shown inside that field
    // on its own page, so they're left out of its list here; the record they
    // point at still lists them as backlinks (KD-023).
    where: { userId: user.id, OR: [{ sourceObjectId: objectId, templateFieldId: null }, { targetObjectId: objectId }] },
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
      fromTemplateField: relationship.templateFieldId !== null,
    }];
  });
}

/** Everything a read-only "Kinesis Links" section needs to render an Object's links as full cards -- the links themselves plus each target's preview stats and sneak-peek event. */
export type KinesisLinkSection = {
  links: KinesisLink[];
  previews: Record<string, KinesisLinkPreviewStat[]>;
  recentEvents: Record<string, KinesisLinkRecentEvent>;
};

/**
 * One call for pages that show an Object's Kinesis Links without also
 * offering the "Add custom field -> Kinesis Link" picker (Finance Items,
 * People) -- unlike Documents/Goals/Custom Items, there are no picker
 * candidates to preview, so only the linked targets themselves are read.
 */
export async function getKinesisLinkSection(objectId: string): Promise<KinesisLinkSection> {
  const links = await getKinesisLinks(objectId);
  const targetIds = [...new Set(links.map((link) => link.target.objectId))];
  const [previews, recentEvents] = await Promise.all([
    getKinesisLinkPreviews(targetIds),
    getKinesisLinkRecentEvents(links.map((link) => ({ objectId: link.target.objectId, linkType: link.type }))),
  ]);
  return { links, previews, recentEvents };
}
