import type { ObjectEvent, ObjectRelationshipType, Prisma } from "@prisma/client";
import type { prisma } from "./prisma";
import { kinesisLinkLabel } from "@/lib/objects/relationship-labels";

/**
 * No `@/lib/auth` import here, deliberately: every write helper below takes
 * `userId` explicitly rather than self-authenticating, so this file stays
 * free of `server-only`'s taint and importable from anywhere that already
 * has a `userId` in hand -- including `lib/data/objects.ts`'s `deleteObjects`,
 * which is itself imported by plain unit tests that exercise `objectFor`
 * without a request context at all. The one function that DOES need to
 * authenticate itself, `getObjectEvents`, lives in `object-event-history.ts`
 * instead, specifically so importing it can't drag `server-only` in here too.
 */
type Client = Prisma.TransactionClient | typeof prisma;

type RelationshipEndpoint = { objectId: string; name: string };

/**
 * One relationship change writes two `ObjectEvent` rows, one per endpoint
 * (KD-048) -- `ObjectEvent`'s read model is single-object-scoped
 * (`getObjectEvents` below), unlike `ObjectRelationship`'s own
 * derive-at-query-time perspective, so a Kinesis Link meant to show on both
 * linked objects' pages needs a history entry on both, or it reads as
 * added-from-nowhere on whichever side didn't get one.
 */
async function writeEventPair(client: Client, rows: [Prisma.ObjectEventCreateManyInput, Prisma.ObjectEventCreateManyInput]) {
  await client.objectEvent.createMany({ data: rows });
}

/** A Kinesis Link's `type`/`customLabel`, resolved to what each event field actually stores -- the literal text only when it's the value (CUSTOM), never a resolved label. */
function relationshipValue(type: ObjectRelationshipType, customLabel: string | null) {
  return type === "CUSTOM" ? customLabel : null;
}

/** Adding a Kinesis Link (`addKinesisLinkAction`) -- writes the paired `RELATIONSHIP_ADDED` rows described above. */
export async function recordRelationshipAdded(client: Client, params: {
  userId: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  type: ObjectRelationshipType;
  customLabel: string | null;
}) {
  const { userId, source, target, type, customLabel } = params;
  const value = relationshipValue(type, customLabel);
  await writeEventPair(client, [
    { id: crypto.randomUUID(), userId, objectId: source.objectId, eventType: "RELATIONSHIP_ADDED", newRelationshipType: type, inverse: false, newValue: value, relatedObjectId: target.objectId, relatedObjectName: target.name, source: "USER" },
    { id: crypto.randomUUID(), userId, objectId: target.objectId, eventType: "RELATIONSHIP_ADDED", newRelationshipType: type, inverse: true, newValue: value, relatedObjectId: source.objectId, relatedObjectName: source.name, source: "USER" },
  ]);
}

/** Removing a Kinesis Link (`removeKinesisLinkAction`) -- writes the paired `RELATIONSHIP_REMOVED` rows. */
export async function recordRelationshipRemoved(client: Client, params: {
  userId: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  type: ObjectRelationshipType;
  customLabel: string | null;
}) {
  const { userId, source, target, type, customLabel } = params;
  const value = relationshipValue(type, customLabel);
  await writeEventPair(client, [
    { id: crypto.randomUUID(), userId, objectId: source.objectId, eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: type, inverse: false, oldValue: value, relatedObjectId: target.objectId, relatedObjectName: target.name, source: "USER" },
    { id: crypto.randomUUID(), userId, objectId: target.objectId, eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: type, inverse: true, oldValue: value, relatedObjectId: source.objectId, relatedObjectName: source.name, source: "USER" },
  ]);
}

/**
 * Retyping an existing Kinesis Link in place (`updateKinesisLinkAction`,
 * KD-050's "Change relationship") -- one `RELATIONSHIP_CHANGED` event per
 * endpoint rather than a remove-then-add pair, since retyping never changes
 * *what's* linked, only *how* (KD-048). `inverse` stays constant per side
 * across the change -- only the type(s)/text differ.
 */
export async function recordRelationshipChanged(client: Client, params: {
  userId: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  oldType: ObjectRelationshipType;
  oldCustomLabel: string | null;
  newType: ObjectRelationshipType;
  newCustomLabel: string | null;
}) {
  const { userId, source, target, oldType, oldCustomLabel, newType, newCustomLabel } = params;
  const base = {
    userId,
    eventType: "RELATIONSHIP_CHANGED" as const,
    oldRelationshipType: oldType,
    newRelationshipType: newType,
    oldValue: relationshipValue(oldType, oldCustomLabel),
    newValue: relationshipValue(newType, newCustomLabel),
    source: "USER" as const,
  };
  await writeEventPair(client, [
    { ...base, id: crypto.randomUUID(), objectId: source.objectId, inverse: false, relatedObjectId: target.objectId, relatedObjectName: target.name },
    { ...base, id: crypto.randomUUID(), objectId: target.objectId, inverse: true, relatedObjectId: source.objectId, relatedObjectName: source.name },
  ]);
}

/**
 * `ITEM_DELETED` is never recorded on the object being deleted -- it would
 * cascade away the instant the delete it's describing commits, since it
 * shares that object's own `objectId` (KD-048). Instead, called *before* the
 * delete itself, this writes `ITEM_DELETED` onto every other object that
 * currently holds a live `ObjectRelationship` to one of `objectIds`, so e.g.
 * Goal B's history can still say "Depends on -> Save $30k (deleted)" after
 * Goal A is gone. A relationship between two objects that are *both* being
 * deleted in this same call (a custom module's items deleted together, say)
 * is skipped -- nothing survives on either side to record onto.
 */
export async function recordItemDeletedEvents(client: Client, objectIds: string[], userId: string) {
  if (!objectIds.length) return;
  const deletedIds = new Set(objectIds);
  const relationships = await client.objectRelationship.findMany({
    where: { userId, OR: [{ sourceObjectId: { in: objectIds } }, { targetObjectId: { in: objectIds } }] },
    select: {
      sourceObjectId: true,
      targetObjectId: true,
      sourceObject: { select: { id: true, name: true } },
      targetObject: { select: { id: true, name: true } },
    },
  });

  const rows: Prisma.ObjectEventCreateManyInput[] = [];
  for (const relationship of relationships) {
    const sourceDeleted = deletedIds.has(relationship.sourceObjectId);
    const targetDeleted = deletedIds.has(relationship.targetObjectId);
    if (sourceDeleted === targetDeleted) continue;
    const survivor = sourceDeleted ? relationship.targetObject : relationship.sourceObject;
    const deleted = sourceDeleted ? relationship.sourceObject : relationship.targetObject;
    rows.push({ id: crypto.randomUUID(), userId, objectId: survivor.id, eventType: "ITEM_DELETED", relatedObjectId: deleted.id, relatedObjectName: deleted.name, source: "USER" });
  }
  if (rows.length) await client.objectEvent.createMany({ data: rows });
}

/** Resolves a canonical/`CUSTOM` type + snapshot into the label it reads as from this row's own side, falling back gracefully for a row somehow missing the type its own event type requires. */
function resolveLabel(type: ObjectRelationshipType | null, value: string | null, inverse: boolean | null) {
  if (!type) return "Related to";
  return kinesisLinkLabel(type, value, inverse ?? false);
}

/**
 * Renders one `ObjectEvent` to the single line its History entry shows. Pure
 * and exported on its own (rather than folded into `getObjectEvents`) so it
 * can be unit-tested without a database.
 */
export function describeObjectEvent(event: ObjectEvent): string {
  const relatedName = event.relatedObjectName ?? "a deleted record";
  switch (event.eventType) {
    case "RELATIONSHIP_ADDED":
      return `${resolveLabel(event.newRelationshipType, event.newValue, event.inverse)} → ${relatedName}`;
    case "RELATIONSHIP_REMOVED":
      return `No longer linked: ${resolveLabel(event.oldRelationshipType, event.oldValue, event.inverse)} → ${relatedName}`;
    case "RELATIONSHIP_CHANGED":
      return `${resolveLabel(event.oldRelationshipType, event.oldValue, event.inverse)} → ${resolveLabel(event.newRelationshipType, event.newValue, event.inverse)} (${relatedName})`;
    case "ITEM_DELETED":
      return `${relatedName} was deleted`;
    case "ITEM_CREATED":
      return "Created";
    default:
      return event.fieldLabel ? `${event.fieldLabel} changed` : "Updated";
  }
}
