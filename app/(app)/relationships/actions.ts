"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";
import {
  isSelfPerson,
  validateGeometry,
  validateRelationshipMap,
  type ConnectionPracticeEntry,
  type ImportantDateEntry,
  type PersonGeometry,
  type ReflectionEntry,
  type RelationshipMapData,
} from "@/lib/relationships";
import { requireKinesisUser } from "@/lib/auth";
import { deleteObjects, objectFor } from "@/lib/data/objects";
import { parseDateOnly } from "@/lib/dates";
import { revalidateShell } from "@/lib/actions/revalidate";

export type RelationshipMapState = { error?: string; savedAt?: number };

/** A refusal the owner should read, as opposed to a fault they cannot act on. */
class SaveRefused extends Error {}

/** Which parent a set of child rows hangs off: a connection, or a person's own space. */
type ChildOwner = { relationshipId: string } | { selfPersonId: string };

const ownerOf = (row: { relationshipId: string | null; selfPersonId: string | null }) => row.relationshipId ?? row.selfPersonId ?? "";
const sameDate = (stored: Date | null, next: Date) => stored?.getTime() === next.getTime();

function groupByOwner<TRow extends { relationshipId: string | null; selfPersonId: string | null }>(rows: TRow[]) {
  const grouped = new Map<string, TRow[]>();
  for (const row of rows) {
    const key = ownerOf(row);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/**
 * Which rows to drop, add and change for one owner's list.
 *
 * Split out from the writing so the four child collections share one notion of
 * what reconciling means, and so the decision can be reasoned about without a
 * database: an id present on both sides is the same row, and it is written only
 * if something about it actually differs.
 */
type ReconcilePlan<TEntry> = { stale: string[]; created: { entry: TEntry; position: number }[]; updated: { entry: TEntry; position: number }[] };

function planReconcile<TEntry extends { id: string }, TRow extends { id: string }>(
  entries: readonly TEntry[],
  existing: readonly TRow[],
  changed: (row: TRow, entry: TEntry, position: number) => boolean,
): ReconcilePlan<TEntry> {
  const kept = new Set(entries.map((entry) => entry.id));
  const byId = new Map(existing.map((row) => [row.id, row]));
  const plan: ReconcilePlan<TEntry> = { stale: existing.filter((row) => !kept.has(row.id)).map((row) => row.id), created: [], updated: [] };
  entries.forEach((entry, position) => {
    const row = byId.get(entry.id);
    if (!row) plan.created.push({ entry, position });
    else if (changed(row, entry, position)) plan.updated.push({ entry, position });
  });
  return plan;
}

/**
 * Positions, saved on their own.
 *
 * Dragging a bubble used to rewrite the entire relationship graph behind it --
 * every person, connection, practice, reflection and important date deleted and
 * re-created, 350ms after the pointer came to rest. This writes the three
 * columns that actually moved.
 *
 * Deliberately no `revalidatePath`: nothing outside this canvas renders a
 * bubble's coordinates, and revalidating the layout would re-run the whole
 * notification engine on every drag.
 *
 * `updateMany` rather than `update` so a person the browser has staged but not
 * saved yet -- or one it has just deleted -- is a no-op instead of a crash. The
 * content save writes their real position when it creates them.
 */
export async function saveMapGeometry(geometry: PersonGeometry[]): Promise<RelationshipMapState> {
  const user = await requireKinesisUser();
  const invalid = validateGeometry(geometry);
  if (invalid) return { error: invalid };
  if (!geometry.length) return { savedAt: Date.now() };

  try {
    await prisma.$transaction(geometry.map((person) => prisma.person.updateMany({
      where: { id: person.id, userId: user.id },
      data: { positionX: person.x, positionY: person.y, bubbleSize: person.size },
    })));
  } catch (error) {
    console.error("Failed to save relationship map positions", error);
    return { error: "Positions could not be saved." };
  }
  return { savedAt: Date.now() };
}

/**
 * Saves everything about the map except where the bubbles sit.
 *
 * This reconciles: rows that are still there are updated in place, rows that
 * have gone are deleted, and only genuinely new rows are created. It used to
 * delete every person and connection the account had and rebuild the lot from
 * the browser's copy, which is what made a failure here unrecoverable, and what
 * reset every practice's schedule and every important date's notification.
 *
 * Every child collection is read in one query for the whole map and written in
 * one statement per table, rather than a query per person and per connection.
 * A save that changes nothing costs a handful of SELECTs and no writes at all.
 *
 * It returns its outcome rather than throwing. The map shows the message.
 */
export async function saveRelationshipMap(data: RelationshipMapData): Promise<RelationshipMapState> {
  const user = await requireKinesisUser();
  const invalid = validateRelationshipMap(data);
  if (invalid) return { error: invalid };

  const personIds = data.people.map((person) => person.id);
  const relationshipIds = data.relationships.map((relationship) => relationship.id);

  try {
    await prisma.$transaction(async (tx) => {
      const linkedGoalIds = [...new Set(data.relationships.flatMap((relationship) => relationship.linkedGoals))];
      if (linkedGoalIds.length) {
        const owned = await tx.goal.count({ where: { id: { in: linkedGoalIds }, userId: user.id } });
        if (owned !== linkedGoalIds.length) throw new SaveRefused("One or more linked goals were not found.");
      }

      // --- People -------------------------------------------------------
      const existingPeople = await tx.person.findMany({
        where: { userId: user.id },
        select: { id: true, objectId: true, name: true, category: true, icon: true, color: true, isSelf: true, selfNotes: true },
      });
      const kept = new Set(personIds);
      // Removed through their identity, which cascades to the person, their
      // connections, and everything hanging off both.
      const removed = existingPeople.filter((person) => !kept.has(person.id)).map((person) => person.objectId);
      if (removed.length) await deleteObjects(tx, removed, user.id);

      const peopleById = new Map(existingPeople.map((person) => [person.id, person]));
      // Recorded as the loop goes, so "Added"/"Updated" is decided against the
      // row as it was before this save rather than guessed at afterwards. A
      // resize no longer counts as a change worth logging: bubble size is
      // geometry now, and it saves silently as the owner drags.
      const activity: Prisma.ActivityEventCreateManyInput[] = [];
      for (const person of data.people) {
        const self = isSelfPerson(person);
        const category = self ? null : person.detail;
        const notes = person.selfRelationship.notes || null;
        const existing = peopleById.get(person.id);
        const edited = existing && (existing.name !== person.name || (existing.category || "Relationship") !== person.detail
          || existing.icon !== person.icon || existing.color !== person.color);
        if (!self && (!existing || edited)) {
          activity.push({ id: crypto.randomUUID(), userId: user.id, action: existing ? "Updated" : "Added", moduleName: "Relationships", objectName: person.name, icon: "relationships", href: "/relationships" });
        }
        if (!existing) {
          await tx.person.create({ data: {
            id: person.id, user: { connect: { id: user.id } }, name: person.name, category, isSelf: self,
            icon: person.icon, color: person.color, selfNotes: notes,
            // A person the browser has only just invented has no row for
            // geometry autosave to have updated, so their first position is
            // written here. Existing people are left alone: the payload's
            // coordinates can be older than the last drag.
            positionX: person.x, positionY: person.y, bubbleSize: person.size,
            object: objectFor.person(person.name, user.id),
          } });
        } else if (edited || existing.isSelf !== self || (existing.selfNotes ?? "") !== person.selfRelationship.notes) {
          await tx.person.update({ where: { id: person.id }, data: { name: person.name, category, isSelf: self, icon: person.icon, color: person.color, selfNotes: notes } });
        }
      }
      if (activity.length) await tx.activityEvent.createMany({ data: activity });

      // --- Connections --------------------------------------------------
      // Read after the deletions above: a connection belonging to a person who
      // has just gone is already gone with them.
      const existingRelationships = await tx.relationship.findMany({
        where: { userId: user.id },
        select: { id: true, firstPersonId: true, secondPersonId: true, type: true, notes: true },
      });
      const keptRelationships = new Set(relationshipIds);
      const staleRelationships = existingRelationships.filter((relationship) => !keptRelationships.has(relationship.id)).map((relationship) => relationship.id);
      if (staleRelationships.length) await tx.relationship.deleteMany({ where: { userId: user.id, id: { in: staleRelationships } } });

      const relationshipsById = new Map(existingRelationships.map((relationship) => [relationship.id, relationship]));
      for (const relationship of data.relationships) {
        const existing = relationshipsById.get(relationship.id);
        const notes = relationship.notes || null;
        if (!existing) {
          await tx.relationship.create({ data: {
            id: relationship.id, userId: user.id,
            firstPersonId: relationship.from, secondPersonId: relationship.to,
            type: relationship.type, notes,
          } });
        } else {
          // Who a connection joins is its identity. Nothing in the map can
          // re-point an existing one, so a payload that does is not an edit to
          // apply -- and applying it would collide with the unique pair.
          if (existing.firstPersonId !== relationship.from || existing.secondPersonId !== relationship.to) {
            throw new SaveRefused("A connection cannot be moved to different people.");
          }
          if (existing.type !== relationship.type || (existing.notes ?? "") !== relationship.notes) {
            await tx.relationship.update({ where: { id: relationship.id }, data: { type: relationship.type, notes } });
          }
        }
      }

      // --- Practices, reflections, important dates, linked goals ---------
      // One read per table for the entire map, then one write per table. The
      // owner lists come from the payload, and everything not named by them was
      // already removed above, so nothing outside this map is in scope.
      //
      // personIds/relationshipIds are payload-supplied, not pre-verified as
      // this user's own -- so ownership is asserted here, through the relation,
      // rather than assumed from the id lists alone. Nothing upstream should be
      // relied on to have already ruled out someone else's id reaching this far.
      const ownerScope = {
        OR: [
          { selfPersonId: { in: personIds }, selfPerson: { userId: user.id } },
          { relationshipId: { in: relationshipIds }, relationship: { userId: user.id } },
        ],
      };
      const [practiceRows, reflectionRows, importantDateRows, linkedGoalRows] = await Promise.all([
        tx.connectionPractice.findMany({ where: ownerScope, select: { id: true, title: true, cadence: true, anchorDate: true, position: true, relationshipId: true, selfPersonId: true } }),
        tx.relationshipReflection.findMany({ where: ownerScope, select: { id: true, text: true, reflectedAt: true, relationshipId: true, selfPersonId: true } }),
        tx.relationshipImportantDate.findMany({ where: ownerScope, select: { id: true, label: true, date: true, repeatsYearly: true, relationshipId: true, selfPersonId: true } }),
        tx.relationshipGoal.findMany({ where: { relationshipId: { in: relationshipIds }, relationship: { userId: user.id } }, select: { relationshipId: true, goalId: true } }),
      ]);

      const practicesByOwner = groupByOwner(practiceRows);
      const reflectionsByOwner = groupByOwner(reflectionRows);
      const importantDatesByOwner = groupByOwner(importantDateRows);

      const stalePractices: string[] = [];
      const staleReflections: string[] = [];
      const staleImportantDates: string[] = [];
      const newPractices: Prisma.ConnectionPracticeCreateManyInput[] = [];
      const newReflections: Prisma.RelationshipReflectionCreateManyInput[] = [];
      const newImportantDates: Prisma.RelationshipImportantDateCreateManyInput[] = [];
      const edits: Prisma.PrismaPromise<unknown>[] = [];

      const reconcileChildren = (owner: ChildOwner, id: string, children: {
        practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; importantDates: ImportantDateEntry[];
      }) => {
        const practices = planReconcile(children.practices, practicesByOwner.get(id) ?? [], (row, entry, position) =>
          row.title !== entry.title || (row.cadence ?? "") !== entry.cadence || row.position !== position || !sameDate(row.anchorDate, parseDateOnly(entry.anchorDate)!));
        stalePractices.push(...practices.stale);
        for (const { entry, position } of practices.created) newPractices.push({ id: entry.id, ...owner, title: entry.title, cadence: entry.cadence, anchorDate: parseDateOnly(entry.anchorDate)!, position });
        for (const { entry, position } of practices.updated) edits.push(tx.connectionPractice.update({ where: { id: entry.id }, data: { title: entry.title, cadence: entry.cadence, anchorDate: parseDateOnly(entry.anchorDate)!, position } }));

        const reflections = planReconcile(children.reflections, reflectionsByOwner.get(id) ?? [], (row, entry) =>
          row.text !== entry.text || !sameDate(row.reflectedAt, parseDateOnly(entry.date)!));
        staleReflections.push(...reflections.stale);
        for (const { entry } of reflections.created) newReflections.push({ id: entry.id, ...owner, text: entry.text, reflectedAt: parseDateOnly(entry.date)! });
        for (const { entry } of reflections.updated) edits.push(tx.relationshipReflection.update({ where: { id: entry.id }, data: { text: entry.text, reflectedAt: parseDateOnly(entry.date)! } }));

        const importantDates = planReconcile(children.importantDates, importantDatesByOwner.get(id) ?? [], (row, entry) =>
          row.label !== entry.label || row.repeatsYearly !== entry.repeatsYearly || !sameDate(row.date, parseDateOnly(entry.date)!));
        staleImportantDates.push(...importantDates.stale);
        for (const { entry } of importantDates.created) newImportantDates.push({ id: entry.id, ...owner, label: entry.label, date: parseDateOnly(entry.date)!, repeatsYearly: entry.repeatsYearly });
        for (const { entry } of importantDates.updated) edits.push(tx.relationshipImportantDate.update({ where: { id: entry.id }, data: { label: entry.label, date: parseDateOnly(entry.date)!, repeatsYearly: entry.repeatsYearly } }));
      };

      for (const person of data.people) reconcileChildren({ selfPersonId: person.id }, person.id, person.selfRelationship);
      for (const relationship of data.relationships) reconcileChildren({ relationshipId: relationship.id }, relationship.id, relationship);

      // Deletes before creates, so an id reused within one save cannot collide.
      if (stalePractices.length) await tx.connectionPractice.deleteMany({ where: { id: { in: stalePractices } } });
      if (staleReflections.length) await tx.relationshipReflection.deleteMany({ where: { id: { in: staleReflections } } });
      if (staleImportantDates.length) await tx.relationshipImportantDate.deleteMany({ where: { id: { in: staleImportantDates } } });
      if (newPractices.length) await tx.connectionPractice.createMany({ data: newPractices });
      if (newReflections.length) await tx.relationshipReflection.createMany({ data: newReflections });
      if (newImportantDates.length) await tx.relationshipImportantDate.createMany({ data: newImportantDates });
      for (const edit of edits) await edit;

      // Linked goals are a join table with no identity of its own, so they are
      // the one collection where add-and-remove is the whole story.
      const linkedByRelationship = new Map<string, Set<string>>();
      for (const row of linkedGoalRows) {
        const bucket = linkedByRelationship.get(row.relationshipId) ?? new Set<string>();
        bucket.add(row.goalId);
        linkedByRelationship.set(row.relationshipId, bucket);
      }
      const unlinked: Prisma.RelationshipGoalWhereInput[] = [];
      const linked: Prisma.RelationshipGoalCreateManyInput[] = [];
      for (const relationship of data.relationships) {
        const present = linkedByRelationship.get(relationship.id) ?? new Set<string>();
        const wanted = new Set(relationship.linkedGoals);
        const dropped = [...present].filter((goalId) => !wanted.has(goalId));
        if (dropped.length) unlinked.push({ relationshipId: relationship.id, goalId: { in: dropped } });
        for (const goalId of relationship.linkedGoals) if (!present.has(goalId)) linked.push({ relationshipId: relationship.id, goalId });
      }
      if (unlinked.length) await tx.relationshipGoal.deleteMany({ where: { OR: unlinked } });
      if (linked.length) await tx.relationshipGoal.createMany({ data: linked });
    }, { timeout: 20_000 });
  } catch (error) {
    if (error instanceof SaveRefused) return { error: error.message };
    console.error("Failed to save the relationship map", error);
    return { error: "The map could not be saved. Your changes are still here — try again." };
  }

  revalidateShell();
  return { savedAt: Date.now() };
}
