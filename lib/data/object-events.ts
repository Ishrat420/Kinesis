import type { ObjectEvent, ObjectEventType, ObjectRelationshipType, Prisma } from "@prisma/client";
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

/** One changed field, ready to write -- see `diffObjectFields` below. */
export type FieldChange = { fieldKey: string; fieldLabel: string; oldValue: string | null; newValue: string | null };

/** Snapshot of one `ObjectField` row, enough to diff a before/after set by id. */
export type ObjectFieldSnapshot = { id: string; label: string; value: string };

/**
 * Diffs two `ObjectField` snapshots by id -- shared by Documents, Goals, and
 * Custom Items' own ad-hoc fields, which all save through the same
 * delete-then-recreate-all pattern (KD-048 Phase 1 remainder, Finding 2).
 * That round trip is safe to diff by id because `prepareCustomFields` reuses
 * each submitted field's own id when the client sent one, so an existing
 * field's id survives even though its row is technically dropped and
 * reinserted. A field present in `before` but missing from `after` is a
 * removal, not "renamed to nothing" -- its old value is still worth a
 * history line. A pure rename with no value change is not treated as a
 * change; only the value is compared.
 */
export function diffObjectFields(before: ObjectFieldSnapshot[], after: ObjectFieldSnapshot[]): FieldChange[] {
  const beforeById = new Map(before.map((field) => [field.id, field]));
  const afterById = new Map(after.map((field) => [field.id, field]));
  const changes: FieldChange[] = [];
  for (const [id, previous] of beforeById) {
    const next = afterById.get(id);
    if (!next) changes.push({ fieldKey: id, fieldLabel: previous.label, oldValue: previous.value, newValue: null });
    else if (next.value !== previous.value) changes.push({ fieldKey: id, fieldLabel: next.label, oldValue: previous.value, newValue: next.value });
  }
  for (const [id, next] of afterById) {
    if (!beforeById.has(id)) changes.push({ fieldKey: id, fieldLabel: next.label, oldValue: null, newValue: next.value });
  }
  return changes;
}

/** One or more fields changed -- `FIELD_CHANGED`, one row per changed field, whether from `diffObjectFields` or a hand-diffed named column. */
export async function recordFieldChanges(client: Client, userId: string, objectId: string, changes: FieldChange[]) {
  if (!changes.length) return;
  await client.objectEvent.createMany({
    data: changes.map((change) => ({
      id: crypto.randomUUID(), userId, objectId, eventType: "FIELD_CHANGED" as const,
      fieldKey: change.fieldKey, fieldLabel: change.fieldLabel, oldValue: change.oldValue, newValue: change.newValue, source: "USER" as const,
    })),
  });
}

/**
 * A status-shaped field changed -- `STATUS_CHANGED`, its own type since
 * every consumer cares about status specifically. `source` defaults to
 * `USER` (a person chose the new status directly); a status that recomputes
 * itself automatically -- a Document crossing its own expiry date, read
 * lazily on the next page view -- passes `SYSTEM` instead, since no one
 * took an action here at all.
 */
export async function recordStatusChanged(client: Client, userId: string, objectId: string, oldValue: string, newValue: string, source: "USER" | "SYSTEM" = "USER") {
  await client.objectEvent.create({ data: { id: crypto.randomUUID(), userId, objectId, eventType: "STATUS_CHANGED", fieldKey: "status", fieldLabel: "Status", oldValue, newValue, source } });
}

/** A record's `archived` flag flipped -- `ITEM_ARCHIVED`/`ITEM_RESTORED`, shared by Documents and Custom Items rather than a Document-specific pair. */
export async function recordArchivedChanged(client: Client, userId: string, objectId: string, archived: boolean) {
  await client.objectEvent.create({ data: { id: crypto.randomUUID(), userId, objectId, eventType: archived ? "ITEM_ARCHIVED" : "ITEM_RESTORED", source: "USER" } });
}

/**
 * A plain, dataless moment with no field to diff -- `ITEM_CREATED`,
 * `GOAL_COMPLETED`, `GOAL_MILESTONE_COMPLETED`, `TODO_COMPLETED`,
 * `TODO_REOPENED`. `label` names the specific thing for a type that needs
 * one (a milestone's own name for `GOAL_MILESTONE_COMPLETED`); omitted, the
 * line reads generically.
 */
export async function recordEvent(
  client: Client,
  userId: string,
  objectId: string,
  eventType: Extract<ObjectEventType, "ITEM_CREATED" | "GOAL_COMPLETED" | "GOAL_MILESTONE_COMPLETED" | "TODO_COMPLETED" | "TODO_REOPENED">,
  label?: string,
) {
  await client.objectEvent.create({ data: { id: crypto.randomUUID(), userId, objectId, eventType, fieldLabel: label ?? null, source: "USER" } });
}

/** Resolves a canonical/`CUSTOM` type + snapshot into the label it reads as from this row's own side, falling back gracefully for a row somehow missing the type its own event type requires. */
function resolveLabel(type: ObjectRelationshipType | null, value: string | null, inverse: boolean | null) {
  if (!type) return "Related to";
  return kinesisLinkLabel(type, value, inverse ?? false);
}

/**
 * One rendered History entry -- a short `title` naming what happened, and an
 * optional `detail` line spelling out the before/after (or the two sides of
 * a Kinesis Link) beneath it. `detail` is `null` for a dataless moment like
 * `ITEM_CREATED` that has nothing to show a second line for.
 */
export type ObjectEventDescription = { title: string; detail: string | null };

/**
 * Renders one `ObjectEvent` to the title/detail pair its History entry
 * shows. Pure and exported on its own (rather than folded into
 * `getObjectEvents`) so it can be unit-tested without a database.
 */
export function describeObjectEvent(event: ObjectEvent): ObjectEventDescription {
  const relatedName = event.relatedObjectName ?? "a deleted record";
  switch (event.eventType) {
    case "RELATIONSHIP_ADDED":
      return { title: "Linked", detail: `${resolveLabel(event.newRelationshipType, event.newValue, event.inverse)} · ${relatedName}` };
    case "RELATIONSHIP_REMOVED":
      return { title: "No longer linked", detail: `${resolveLabel(event.oldRelationshipType, event.oldValue, event.inverse)} · ${relatedName}` };
    case "RELATIONSHIP_CHANGED":
      return { title: "Relationship changed", detail: `From ${resolveLabel(event.oldRelationshipType, event.oldValue, event.inverse)} · To ${resolveLabel(event.newRelationshipType, event.newValue, event.inverse)} (${relatedName})` };
    case "ITEM_DELETED":
      return { title: `${relatedName} was deleted`, detail: null };
    case "ITEM_CREATED":
      return { title: "Created", detail: null };
    case "ITEM_ARCHIVED":
      return { title: "Archived", detail: null };
    case "ITEM_RESTORED":
      return { title: "Restored", detail: null };
    case "STATUS_CHANGED":
      return { title: "Status changed", detail: `From ${event.oldValue} · To ${event.newValue}` };
    case "GOAL_COMPLETED":
      return { title: "Goal completed", detail: null };
    case "GOAL_MILESTONE_COMPLETED":
      return { title: event.fieldLabel ? `Milestone "${event.fieldLabel}" completed` : "Milestone completed", detail: null };
    case "TODO_COMPLETED":
      return { title: "Completed", detail: null };
    case "TODO_REOPENED":
      return { title: "Reopened", detail: null };
    case "FIELD_CHANGED":
      return describeFieldChange(event);
    default:
      return { title: event.fieldLabel ? `${event.fieldLabel} changed` : "Updated", detail: null };
  }
}

/** `FIELD_CHANGED` reads differently depending on whether the field was added, removed, or simply changed value. */
function describeFieldChange(event: ObjectEvent): ObjectEventDescription {
  const label = event.fieldLabel ?? "A field";
  if (event.oldValue === null) return { title: `${label} set`, detail: `To ${event.newValue}` };
  if (event.newValue === null) return { title: `${label} removed`, detail: `Was ${event.oldValue}` };
  return { title: `${label} changed`, detail: `From ${event.oldValue} · To ${event.newValue}` };
}
