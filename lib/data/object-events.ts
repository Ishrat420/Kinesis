import type { ObjectEvent, ObjectEventType, ObjectRelationshipType, Prisma } from "@prisma/client";
import type { prisma } from "./prisma";
import { kinesisLinkLabel, relationshipIconKey, type RelationshipIconKey } from "@/lib/objects/relationship-labels";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format/numbers";
import { DEFAULT_FORMAT_PREFERENCES, type FormatPreferences } from "@/lib/format/preferences";

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
 * *what's* linked, only *how* (KD-048). `inverse` (the side each endpoint
 * holds *after* the retype) is fixed per side the same way `recordRelationshipAdded`
 * writes it -- but a retype from a forward-facing type to an inverse-facing
 * one (or back) flips which endpoint `ObjectRelationship` stores as its
 * `sourceObjectId`, so the endpoint that held the *old* type's forward side
 * can become the new type's inverse side, or vice versa. `oldSourceObjectId`
 * -- the relationship's source before this retype -- lets each row record
 * its own pre-retype side (`oldInverse`) independently of its post-retype
 * one, rather than assuming the two always match.
 */
export async function recordRelationshipChanged(client: Client, params: {
  userId: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  oldSourceObjectId: string;
  oldType: ObjectRelationshipType;
  oldCustomLabel: string | null;
  newType: ObjectRelationshipType;
  newCustomLabel: string | null;
}) {
  const { userId, source, target, oldSourceObjectId, oldType, oldCustomLabel, newType, newCustomLabel } = params;
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
    { ...base, id: crypto.randomUUID(), objectId: source.objectId, inverse: false, oldInverse: source.objectId !== oldSourceObjectId, relatedObjectId: target.objectId, relatedObjectName: target.name },
    { ...base, id: crypto.randomUUID(), objectId: target.objectId, inverse: true, oldInverse: target.objectId !== oldSourceObjectId, relatedObjectId: source.objectId, relatedObjectName: source.name },
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
 * A plain, mostly-dataless moment with no two-sided value to diff --
 * `ITEM_CREATED`, `GOAL_COMPLETED`, `GOAL_MILESTONE_COMPLETED`,
 * `GOAL_MILESTONE_ADDED`, `GOAL_MILESTONE_DELETED`, `TODO_COMPLETED`,
 * `TODO_REOPENED`, `DOCUMENT_EXPIRING_SOON`. `label` names the specific
 * thing for a type that needs one (a milestone's own name); omitted, the
 * line reads generically. `newValue` carries the one extra fact a moment
 * wants alongside its name -- `GOAL_MILESTONE_ADDED`'s own due date
 * (`formatDateInput`'d), `GOAL_MILESTONE_COMPLETED`/`GOAL_MILESTONE_DELETED`'s
 * `"<completed>/<total>"` progress snapshot (read back by
 * `milestoneProgressText` below), or `DOCUMENT_EXPIRING_SOON`'s own expiry
 * date. `source` defaults to `USER` (this just happened, someone's own
 * doing) -- `DOCUMENT_EXPIRING_SOON` is the one caller that passes `SYSTEM`,
 * for the lazy read-path recompute that finds a document has crossed into
 * its reminder window between one page view and the next, nobody having
 * taken an action here at all (the same reasoning `recordStatusChanged`'s
 * own `source` already documents).
 */
export async function recordEvent(
  client: Client,
  userId: string,
  objectId: string,
  eventType: Extract<ObjectEventType, "ITEM_CREATED" | "GOAL_COMPLETED" | "GOAL_MILESTONE_COMPLETED" | "GOAL_MILESTONE_ADDED" | "GOAL_MILESTONE_DELETED" | "TODO_COMPLETED" | "TODO_REOPENED" | "DOCUMENT_EXPIRING_SOON">,
  label?: string,
  newValue?: string,
  source: "USER" | "SYSTEM" = "USER",
) {
  await client.objectEvent.create({ data: { id: crypto.randomUUID(), userId, objectId, eventType, fieldLabel: label ?? null, newValue: newValue ?? null, source } });
}

/** One changed attribute of a milestone, ready to write -- see `recordMilestoneUpdated` below. */
export type MilestoneFieldChange = { fieldKey: "name" | "value" | "dueDate"; oldValue: string | null; newValue: string | null };

/**
 * A milestone's own name/target value/due date changed -- `GOAL_MILESTONE_UPDATED`,
 * one row per changed attribute (mirroring `recordFieldChanges`), `fieldLabel`
 * carrying the milestone's own name so History (and the Kinesis Link peek
 * reading the same stream) can say *which* milestone, the way
 * `GOAL_MILESTONE_COMPLETED` already does.
 */
export async function recordMilestoneUpdated(client: Client, userId: string, objectId: string, milestoneName: string, changes: MilestoneFieldChange[]) {
  if (!changes.length) return;
  await client.objectEvent.createMany({
    data: changes.map((change) => ({
      id: crypto.randomUUID(), userId, objectId, eventType: "GOAL_MILESTONE_UPDATED" as const,
      fieldKey: change.fieldKey, fieldLabel: milestoneName, oldValue: change.oldValue, newValue: change.newValue, source: "USER" as const,
    })),
  });
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
 *
 * `change` is set only when `detail` is a plain "From X · To Y" before/after
 * (a field's value changing, or a status changing) -- the two sides broken
 * out as their own strings, for a renderer that wants to lay them out as a
 * diff (the Kinesis Link card's own History peek) rather than parse them
 * back out of `detail`'s prose. `direction` is "up"/"down" only when both
 * sides parse as distinct finite numbers; "flat" otherwise (plain text, or
 * a kind -- like Custom Module currency/percent -- already formatted with
 * symbols at write time, so no direction to show from these two strings
 * alone).
 *
 * A relationship event (`RELATIONSHIP_ADDED`/`REMOVED`/`CHANGED`) is a diff
 * too, just not a magnitude one -- `kind: "relationship"` marks it so a
 * renderer can pick an icon by `action` instead of `direction`'s up/down
 * coloring, which a relationship has no use for (`direction` stays "flat").
 * `icon` names which one, by `relationshipIconKey`'s own per-type vocabulary
 * -- set only for `action: "added"`, where the type being added is the
 * useful signal. `action: "removed"` has no `icon`: a renderer shows the
 * same plain "unlinked" glyph either way, since which type was removed
 * matters less than that it's gone. A retype (`action: "changed"`) crosses
 * two different types, so it has no single icon to name either, and a
 * renderer falls back to a neutral one instead. `caption` is set only for
 * that same retype case, naming the target the relationship's `from`/`to`
 * pair is between -- the two labels alone don't say what they're labeling.
 */
export type ObjectEventDescription = {
  title: string;
  detail: string | null;
  change?: {
    from: string;
    to: string;
    direction: "up" | "down" | "flat";
    kind?: "relationship";
    action?: "added" | "removed" | "changed";
    icon?: RelationshipIconKey;
    caption?: string;
  };
};

/** "up"/"down" only when both values parse as distinct finite numbers; "flat" for plain text, unparseable, or equal values. */
function numericDirection(from: string, to: string): "up" | "down" | "flat" {
  const previous = Number(from);
  const next = Number(to);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === next) return "flat";
  return next > previous ? "up" : "down";
}

/** `"<completed>/<total>"` (written by `recordEvent`'s `newValue`) -> "3 of 5 milestones completed", or `null` for a row written before this existed. */
function milestoneProgressText(raw: string | null): string | null {
  const match = raw?.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  return `${match[1]} of ${match[2]} milestones completed`;
}

/** The human label for one of `MilestoneFieldChange`'s attribute keys -- `GOAL_MILESTONE_UPDATED`'s own "which field" analogue to `FIELD_CHANGED`'s free-text `fieldLabel`. */
function milestoneAttributeLabel(fieldKey: string | null): string {
  switch (fieldKey) {
    case "name": return "Name";
    case "value": return "Target value";
    case "dueDate": return "Due date";
    default: return "Milestone";
  }
}

/**
 * Renders one `ObjectEvent` to the title/detail pair its History entry
 * shows. Pure and exported on its own (rather than folded into
 * `getObjectEvents`) so it can be unit-tested without a database. `prefs`
 * defaults to the app's own defaults rather than being required, so every
 * existing call site (and test) that doesn't care about currency/locale
 * keeps working unchanged; a caller that does -- `getObjectEvents` and
 * `getRecentActivity` -- reads the owner's real `FormatPreferences` first.
 */
export function describeObjectEvent(event: ObjectEvent, prefs: Pick<FormatPreferences, "locale" | "currency"> = DEFAULT_FORMAT_PREFERENCES): ObjectEventDescription {
  const relatedName = event.relatedObjectName ?? "a deleted record";
  switch (event.eventType) {
    case "RELATIONSHIP_ADDED": {
      const label = resolveLabel(event.newRelationshipType, event.newValue, event.inverse);
      const icon = relationshipIconKey(event.newRelationshipType, event.inverse);
      return { title: "Linked", detail: `${label} · ${relatedName}`, change: { from: label, to: relatedName, direction: "flat", kind: "relationship", action: "added", icon } };
    }
    case "RELATIONSHIP_REMOVED": {
      // No `icon` here -- a removed link always renders the same plain
      // Unlink glyph regardless of type (`KinesisLinkCard`'s `DiffConnector`),
      // so there's nothing for one to key off.
      const label = resolveLabel(event.oldRelationshipType, event.oldValue, event.inverse);
      return { title: "No longer linked", detail: `${label} · ${relatedName}`, change: { from: label, to: relatedName, direction: "flat", kind: "relationship", action: "removed" } };
    }
    case "RELATIONSHIP_CHANGED": {
      // `oldInverse` is null on rows written before that column existed --
      // falling back to `inverse` there reproduces this event's original
      // (only sometimes correct) rendering for old data, rather than
      // guessing at a pre-retype side this row never recorded.
      const oldLabel = resolveLabel(event.oldRelationshipType, event.oldValue, event.oldInverse ?? event.inverse);
      const newLabel = resolveLabel(event.newRelationshipType, event.newValue, event.inverse);
      return {
        title: "Relationship changed",
        detail: `From ${oldLabel} · To ${newLabel} (${relatedName})`,
        change: { from: oldLabel, to: newLabel, direction: "flat", kind: "relationship", action: "changed", caption: relatedName },
      };
    }
    case "ITEM_DELETED":
      return { title: `${relatedName} was deleted`, detail: null };
    case "ITEM_CREATED":
      return { title: "Created", detail: null };
    case "ITEM_ARCHIVED":
      return { title: "Archived", detail: null };
    case "ITEM_RESTORED":
      return { title: "Restored", detail: null };
    case "STATUS_CHANGED":
      return {
        title: "Status changed",
        detail: `From ${event.oldValue} · To ${event.newValue}`,
        // A status is a fixed vocabulary, never a magnitude -- "flat" always, not numericDirection's job here.
        change: event.oldValue !== null && event.newValue !== null ? { from: event.oldValue, to: event.newValue, direction: "flat" } : undefined,
      };
    case "GOAL_COMPLETED":
      return { title: "Goal completed", detail: null };
    case "DOCUMENT_EXPIRING_SOON":
      return { title: "Document is expiring soon", detail: event.newValue ? `Expires ${formatDate(event.newValue, prefs.locale)}` : null };
    case "GOAL_MILESTONE_COMPLETED":
      return { title: event.fieldLabel ? `Milestone "${event.fieldLabel}" completed` : "Milestone completed", detail: milestoneProgressText(event.newValue) };
    case "GOAL_MILESTONE_ADDED": {
      const name = event.fieldLabel ?? "Milestone";
      const due = event.newValue ? `Due ${formatDate(event.newValue, prefs.locale)}` : null;
      return { title: "Milestone added", detail: due ? `${name} · ${due}` : name };
    }
    case "GOAL_MILESTONE_UPDATED": {
      const name = event.fieldLabel ?? "Milestone";
      const attribute = milestoneAttributeLabel(event.fieldKey);
      const from = event.oldValue ?? "";
      const to = event.newValue ?? "";
      return {
        title: `Milestone "${name}" updated`,
        detail: `${attribute} changed · From ${from} · To ${to}`,
        change: { from, to, direction: numericDirection(from, to) },
      };
    }
    case "GOAL_MILESTONE_DELETED": {
      const name = event.fieldLabel ?? "Milestone";
      const progress = milestoneProgressText(event.newValue);
      return { title: "Milestone deleted", detail: progress ? `${name} · ${progress}` : name };
    }
    case "TODO_COMPLETED":
      return { title: "Completed", detail: null };
    case "TODO_REOPENED":
      return { title: "Reopened", detail: null };
    case "FIELD_CHANGED":
      return describeFieldChange(event, prefs);
    default:
      return { title: event.fieldLabel ? `${event.fieldLabel} changed` : "Updated", detail: null };
  }
}

/**
 * `FIELD_CHANGED` reads differently depending on whether the field was
 * added, removed, or simply changed value. A Finance Item's `amount` is its
 * own case, distinguished by `fieldKey === "amount"` -- the one literal
 * fieldKey `FINANCE_NAMED_FIELDS` (`app/(app)/finance/actions.ts`) writes,
 * unique to that one column: no other module's named-field diff or ad-hoc
 * custom field ever produces it. `fieldLabel` there holds the item's own
 * category (or, for an income/expense item with none, its kind) rather than
 * the generic column name "Amount" -- set at write time so this renderer
 * can read "Savings Increased"/"Decreased" the same way a balance actually
 * moving reads to the owner, formatted as money rather than a bare number.
 */
function describeFieldChange(event: ObjectEvent, prefs: Pick<FormatPreferences, "locale" | "currency">): ObjectEventDescription {
  if (event.fieldKey === "amount" && event.fieldLabel && event.oldValue !== null && event.newValue !== null) {
    const previous = Number(event.oldValue);
    const next = Number(event.newValue);
    const direction = next > previous ? "Increased" : "Decreased";
    const money = (value: number) => formatMoney(value, prefs.locale, prefs.currency);
    const from = money(previous);
    const to = money(next);
    return { title: `${event.fieldLabel} ${direction}`, detail: `From ${from} · To ${to}`, change: { from, to, direction: next > previous ? "up" : "down" } };
  }
  const label = event.fieldLabel ?? "A field";
  if (event.oldValue === null) return { title: `${label} set`, detail: `To ${event.newValue}` };
  if (event.newValue === null) return { title: `${label} removed`, detail: `Was ${event.oldValue}` };
  return {
    title: `${label} changed`,
    detail: `From ${event.oldValue} · To ${event.newValue}`,
    change: { from: event.oldValue, to: event.newValue, direction: numericDirection(event.oldValue, event.newValue) },
  };
}
