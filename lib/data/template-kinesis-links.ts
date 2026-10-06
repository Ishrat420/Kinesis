import type { Prisma } from "@prisma/client";
import { objectPairKey } from "@/lib/objects/relationships";
import { recordRelationshipAdded, recordRelationshipRemoved } from "./object-events";
import type { CustomFieldValue } from "@/lib/custom-fields/types";

/**
 * Kinesis Link fields, stored as Kinesis Links (KD-023).
 *
 * A Kinesis Link field -- a template's "Related" field on a custom item, or an
 * ad-hoc one added while creating a record -- used to keep its targets on
 * ObjectField/FieldLink, which nothing reads from the target's side. Now each
 * target is an ObjectRelationship, so the linked record shows it as a backlink
 * like any other Kinesis Link.
 *
 * - A template field's targets are CUSTOM links from the item, labelled with
 *   the field's name and tied to it by `templateFieldId`. The item's own page
 *   shows them inside that field (and leaves them out of its free-standing
 *   Kinesis Links list); everywhere else they read as ordinary links.
 * - An ad-hoc link field becomes plain CUSTOM links labelled with its name,
 *   exactly as KD-050 converted existing ones. The field itself isn't kept.
 */

type Client = Prisma.TransactionClient;
type Endpoint = { objectId: string; name: string };

/**
 * Makes a template field's links on one item exactly `targetObjectIds`:
 * removes the targets no longer wanted, adds the new ones (in the order
 * given), and records each change in both records' History. Targets must
 * already be checked as the caller's own (validateKinesisTargets).
 */
export async function saveTemplateFieldLinks(
  tx: Client,
  userId: string,
  item: Endpoint,
  field: { id: string; label: string },
  targetObjectIds: string[],
) {
  const wanted = [...new Set(targetObjectIds)].filter((id) => id !== item.objectId);
  const existing = await tx.objectRelationship.findMany({
    where: { userId, sourceObjectId: item.objectId, templateFieldId: field.id },
    select: { id: true, targetObjectId: true, targetObject: { select: { name: true } } },
  });
  const existingIds = new Set(existing.map((link) => link.targetObjectId));
  const removed = existing.filter((link) => !wanted.includes(link.targetObjectId));
  const added = wanted.filter((id) => !existingIds.has(id));

  if (removed.length) await tx.objectRelationship.deleteMany({ where: { id: { in: removed.map((link) => link.id) } } });
  for (const link of removed) {
    await recordRelationshipRemoved(tx, { userId, source: item, target: { objectId: link.targetObjectId, name: link.targetObject.name }, type: "CUSTOM", customLabel: field.label });
  }
  if (!added.length) return;

  const targets = await tx.object.findMany({ where: { id: { in: added }, userId }, select: { id: true, name: true } });
  const nameOf = new Map(targets.map((target) => [target.id, target.name]));
  // Staggered by a millisecond each, so listing by createdAt keeps the order
  // the targets were picked in.
  const now = Date.now();
  await tx.objectRelationship.createMany({
    data: added.filter((id) => nameOf.has(id)).map((targetObjectId, index) => ({
      userId, sourceObjectId: item.objectId, targetObjectId, type: "CUSTOM" as const, customLabel: field.label,
      templateFieldId: field.id, pairKey: objectPairKey(item.objectId, targetObjectId), createdAt: new Date(now + index),
    })),
  });
  for (const targetObjectId of added) {
    const name = nameOf.get(targetObjectId);
    if (name !== undefined) await recordRelationshipAdded(tx, { userId, source: item, target: { objectId: targetObjectId, name }, type: "CUSTOM", customLabel: field.label });
  }
}

/** Each object's targets for each template field, in the order they were added, keyed `${objectId}:${templateFieldId}`. */
export async function readTemplateFieldLinks(client: Pick<Client, "objectRelationship">, objectIds: string[], templateFieldIds?: string[]) {
  const rows = objectIds.length
    ? await client.objectRelationship.findMany({
        where: { sourceObjectId: { in: objectIds }, templateFieldId: templateFieldIds ? { in: templateFieldIds } : { not: null } },
        select: { sourceObjectId: true, targetObjectId: true, templateFieldId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.sourceObjectId}:${row.templateFieldId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.targetObjectId]);
  }
  return byKey;
}

/**
 * Splits a record's submitted custom fields into the ones still stored as
 * fields and the Kinesis Link ones, which are saved as links instead
 * (`createLinksFromFields`). Only ad-hoc fields reach this; template values
 * go through `saveTemplateFieldLinks`.
 */
export function splitKinesisLinkFields<T extends CustomFieldValue>(fields: T[]) {
  return {
    fields: fields.filter((field) => field.type !== "KINESIS_LINK"),
    links: fields.filter((field) => field.type === "KINESIS_LINK").map((field) => ({ label: field.label, targetObjectIds: field.targetObjectIds ?? [] })),
  };
}

/**
 * Saves ad-hoc Kinesis Link fields as free-standing CUSTOM links labelled with
 * the field's name. A link that already exists with the same label between
 * the same two records is the same fact, and is left as it is.
 */
export async function createLinksFromFields(tx: Client, userId: string, source: Endpoint, links: { label: string; targetObjectIds: string[] }[]) {
  for (const { label, targetObjectIds } of links) {
    const ids = [...new Set(targetObjectIds)].filter((id) => id !== source.objectId);
    if (!ids.length) continue;
    const targets = await tx.object.findMany({ where: { id: { in: ids }, userId }, select: { id: true, name: true } });
    for (const target of targets) {
      const created = await tx.objectRelationship.createMany({
        data: [{ userId, sourceObjectId: source.objectId, targetObjectId: target.id, type: "CUSTOM", customLabel: label, pairKey: objectPairKey(source.objectId, target.id) }],
        skipDuplicates: true,
      });
      if (created.count) await recordRelationshipAdded(tx, { userId, source, target: { objectId: target.id, name: target.name }, type: "CUSTOM", customLabel: label });
    }
  }
}
