import type { Prisma, TodoStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { deleteObjects, objectFor } from "./objects";
import { recordEvent, recordFieldChanges, recordRecurrenceCompleted, recordRelationshipAdded, recordRelationshipRemoved, recordStatusChanged, type FieldChange } from "./object-events";
import { requireKinesisUser } from "@/lib/auth";
import { objectPairKey } from "@/lib/objects/relationships";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { isOpenTodoStatus } from "@/lib/todos/status";
import { refuse, refuseConflict } from "@/lib/actions/refusal";
import { formatDateInput } from "@/lib/dates";
import { buildRecurrence, nextDueAfterCompletion, recurrenceColumns, recurrenceFromColumns, recurrenceLabel, type Recurrence } from "@/lib/recurrence";
import { getToday } from "@/lib/format/server";

/**
 * Standalone To-Dos (ADR-009).
 *
 * A To-Do concerns other records rather than owning them, so "link to" is an
 * ObjectRelationship between two identities and not a column here. That is what
 * lets a To-Do concern a Document today and a Finance Item tomorrow without the
 * table learning about either.
 */

/** The one relationship type a To-Do uses: it concerns the thing it points at. */
const CONCERNS = "RELATES_TO" as const;

export type TodoRecord = {
  id: string;
  name: string;
  status: TodoStatus;
  dueDate: Date | null;
  /** KD-056: how `dueDate` repeats, or null for a one-off to-do. */
  recurrence: Recurrence | null;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  /** The objects this To-Do concerns, resolved to where each one lives -- its own links, the set its edit form manages. */
  links: ObjectLocation[];
  /**
   * Objects that link *to* this To-Do from their own side (a document's or
   * goal's Kinesis Link field), not already among `links`. Shown alongside
   * `links` wherever a To-Do's connections are listed, so a link reads from
   * both ends; never fed to the edit form, which only owns `links`.
   */
  linkedFrom: ObjectLocation[];
  /** This To-Do's own Object identity -- for its detail page's History section (KD-048). */
  objectId: string;
};

const todoSelect = {
  id: true, name: true, status: true, dueDate: true, recurrence: true, recurrenceDays: true, recurrenceAnchorDay: true, completedAt: true, notes: true, createdAt: true, objectId: true,
  object: {
    select: {
      outgoingRelationships: { select: { targetObject: { select: objectLocationSelect } }, orderBy: { createdAt: "asc" } },
      incomingRelationships: { select: { sourceObject: { select: objectLocationSelect } }, orderBy: { createdAt: "asc" } },
    },
  },
} as const satisfies Prisma.TodoSelect;

type TodoRow = Prisma.TodoGetPayload<{ select: typeof todoSelect }>;

const toRecurrence = recurrenceFromColumns;

const toRecord = ({ object, recurrence, recurrenceDays, recurrenceAnchorDay, ...todo }: TodoRow): TodoRecord => {
  const links = locateObjects(object.outgoingRelationships.map((relationship) => relationship.targetObject));
  const own = new Set(links.map((link) => link.objectId));
  const incoming = locateObjects(object.incomingRelationships.map((relationship) => relationship.sourceObject)).filter((link) => !own.has(link.objectId));
  // Two Kinesis Links of different types from the same object are one chip.
  const linkedFrom = incoming.filter((link, index) => incoming.findIndex((other) => other.objectId === link.objectId) === index);
  return { ...todo, recurrence: toRecurrence({ recurrence, recurrenceDays, recurrenceAnchorDay }), links, linkedFrom };
};

/**
 * Ordering that answers "what should I look at first": still open before
 * finished, then overdue, then dated, then the most recently captured.
 */
const byUrgency = (first: TodoRecord, second: TodoRecord) => {
  const firstOpen = isOpenTodoStatus(first.status);
  if (firstOpen !== isOpenTodoStatus(second.status)) return firstOpen ? -1 : 1;
  if (Boolean(first.dueDate) !== Boolean(second.dueDate)) return first.dueDate ? -1 : 1;
  if (first.dueDate && second.dueDate) return first.dueDate.getTime() - second.dueDate.getTime();
  return second.createdAt.getTime() - first.createdAt.getTime();
};

export async function getTodos(): Promise<TodoRecord[]> {
  const user = await requireKinesisUser();
  const rows = await prisma.todo.findMany({ where: { userId: user.id }, select: todoSelect });
  return rows.map(toRecord).sort(byUrgency);
}

/** One To-Do's full detail, for its own detail page (KD-048's History section, opened as a "big window" over the board). */
export async function getTodo(id: string): Promise<TodoRecord | null> {
  const user = await requireKinesisUser();
  const row = await prisma.todo.findFirst({ where: { id, userId: user.id }, select: todoSelect });
  return row ? toRecord(row) : null;
}

/** Counts for the To-Do page's summary, taken from the statuses themselves. */
export async function getTodoSummary() {
  const user = await requireKinesisUser();
  const counts = await prisma.todo.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } });
  const total = counts.reduce((sum, { _count }) => sum + _count._all, 0);
  const open = counts.filter(({ status }) => isOpenTodoStatus(status)).reduce((sum, { _count }) => sum + _count._all, 0);
  return { total, open, done: total - open };
}

/**
 * Quick capture's whole job: a title becomes a record, immediately.
 *
 * Nothing else is required, because requiring anything else is the reason the
 * user would have reached for another app instead (ADR-009).
 */
export async function captureTodo(name: string) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.create({
      data: { id: crypto.randomUUID(), name, user: { connect: { id: user.id } }, object: objectFor.todo(name, user.id) },
      select: { id: true, name: true, objectId: true },
    });
    await recordEvent(transaction, user.id, todo.objectId, "ITEM_CREATED");
    return { id: todo.id, name: todo.name };
  });
}

export type NewTodoDetails = { status?: TodoStatus; dueDate?: Date | null; recurrence?: Recurrence | null; notes?: string | null; linkObjectIds?: string[] };

/**
 * The in-page "Add to-do" button's create, as opposed to quick capture's
 * title-only `captureTodo` above: status, due date, notes and links go in
 * with the title in one transaction, so a to-do with an unresolved link is
 * never left half-created.
 */
export async function createTodo(name: string, { status = "TODO", dueDate = null, recurrence = null, notes = null, linkObjectIds = [] }: NewTodoDetails = {}) {
  const user = await requireKinesisUser();
  // KD-056: a repeat needs a date to repeat from, and a repeating to-do is
  // never stored as Done -- completing it moves the date instead.
  if (recurrence && !dueDate) refuse("Pick a due date for a to-do that repeats.");
  if (recurrence && status === "DONE") refuse("A repeating to-do can't start as Done.");
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.create({
      data: {
        id: crypto.randomUUID(),
        name,
        status,
        dueDate,
        ...recurrenceColumns(recurrence),
        notes,
        completedAt: isOpenTodoStatus(status) ? null : new Date(),
        user: { connect: { id: user.id } },
        object: objectFor.todo(name, user.id),
      },
      select: { id: true, name: true, objectId: true },
    });
    await recordEvent(transaction, user.id, todo.objectId, "ITEM_CREATED");

    const targets = [...new Set(linkObjectIds.filter(Boolean))];
    if (targets.length) {
      // A lookup with names, not just a count: either every target is the
      // user's or the whole create is refused, and the names are what the
      // paired RELATIONSHIP_ADDED events below snapshot as relatedObjectName.
      const owned = await transaction.object.findMany({ where: { id: { in: targets }, userId: user.id }, select: { id: true, name: true } });
      if (owned.length !== targets.length) refuse("One of the linked items no longer exists.");
      await transaction.objectRelationship.createMany({
        data: targets.map((targetObjectId) => ({
          userId: user.id, sourceObjectId: todo.objectId, targetObjectId,
          pairKey: objectPairKey(todo.objectId, targetObjectId), type: CONCERNS,
        })),
      });
      const nameOf = (id: string) => owned.find((object) => object.id === id)!.name;
      for (const targetObjectId of targets) {
        await recordRelationshipAdded(transaction, {
          userId: user.id,
          source: { objectId: todo.objectId, name: todo.name },
          target: { objectId: targetObjectId, name: nameOf(targetObjectId) },
          type: CONCERNS,
          customLabel: null,
        });
      }
    }

    return { id: todo.id, name: todo.name };
  });
}

export type TodoDetails = {
  status?: TodoStatus;
  dueDate?: Date | null;
  /** KD-056: the repeat rule -- `undefined` leaves it alone, `null` makes the to-do a one-off. Cleared automatically if the due date is cleared. */
  recurrence?: Recurrence | null;
  /**
   * The due date the caller showed when it marked a repeating to-do done. A
   * completion is refused as a conflict if the to-do has since moved on, so a
   * double click or a stale tab can't complete the same occurrence twice and
   * silently skip one (the BUG-007 pattern).
   */
  expectedDueDate?: Date | null;
  notes?: string | null;
  linkObjectIds?: string[];
};

/** `advancedTo` is set when the save completed an occurrence of a repeating to-do: the due date it moved on to. */
export type UpdatedTodo = TodoRecord & { advancedTo?: Date };

/**
 * The "Add details" step. Every field is optional and independent: a caller
 * that only knows the status leaves the rest alone rather than clearing it.
 *
 * `linkObjectIds` is the exception to that. It is the complete set of objects
 * the To-Do concerns, so an empty array means "no longer concerns anything" --
 * a choice the user can make, and applied -- while `undefined` leaves the
 * existing links alone.
 *
 * KD-056: marking a *repeating* to-do Done -- from the board's checkbox, the
 * dashboard's Complete, or the edit form -- completes the current occurrence
 * instead: the due date moves to the next one (one step from the due date,
 * caught up to today or later if it was long overdue), the to-do stays open
 * as To do, and a RECURRENCE_COMPLETED event records the occurrence. Every
 * "mark done" path in the app goes through here, so none can close one.
 */
export async function updateTodoDetails(id: string, { status, dueDate, recurrence, expectedDueDate, notes, linkObjectIds }: TodoDetails): Promise<UpdatedTodo> {
  const user = await requireKinesisUser();
  const today = await getToday();
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.findFirst({ where: { id, userId: user.id }, select: { objectId: true, name: true, status: true, dueDate: true, recurrence: true, recurrenceDays: true, recurrenceAnchorDay: true, notes: true } });
    if (!todo) refuse("This to-do no longer exists.");
    let advancedTo: Date | undefined;

    if (status !== undefined || dueDate !== undefined || recurrence !== undefined || notes !== undefined) {
      const oldRecurrence = toRecurrence(todo);
      const nextDueDate = dueDate !== undefined ? dueDate : todo.dueDate;
      let nextRecurrence = recurrence !== undefined ? recurrence : oldRecurrence;
      // No date, nothing to repeat from: clearing the date clears the repeat.
      if (!nextDueDate) nextRecurrence = null;
      // A monthly or yearly rule keeps its stored anchor day when neither the
      // date nor the rule changed, so re-saving a clamped 28 Feb (anchored on
      // the 31st) never quietly re-anchors it to the 28th (same as KD-055).
      // Any real change -- a new rule, or the date moved (a reschedule) --
      // anchors afresh on the new date.
      if (nextRecurrence && nextDueDate) {
        const unchanged = oldRecurrence && todo.dueDate
          && nextRecurrence.rule === oldRecurrence.rule && nextRecurrence.days === oldRecurrence.days
          && formatDateInput(nextDueDate) === formatDateInput(todo.dueDate);
        nextRecurrence = unchanged ? oldRecurrence : buildRecurrence(nextRecurrence.rule, nextDueDate, nextRecurrence.days);
      }

      const nextStatus = status ?? todo.status;
      const completingOccurrence = nextRecurrence !== null && nextStatus === "DONE";
      if (completingOccurrence && todo.status === "DONE") refuse("Reopen this to-do before making it repeat.");

      if (completingOccurrence) {
        if (expectedDueDate && todo.dueDate && formatDateInput(expectedDueDate) !== formatDateInput(todo.dueDate)) {
          refuseConflict("This occurrence was already completed or changed. Reload to see the latest.");
        }
        const completed = nextDueDate!;
        const { next } = nextDueAfterCompletion(completed, nextRecurrence!, today);
        // Conditioned on the date this transaction read, so a concurrent
        // completion of the same occurrence loses here rather than skipping one.
        const result = await transaction.todo.updateMany({
          where: { id, dueDate: todo.dueDate },
          data: { status: "TODO", completedAt: null, dueDate: next, ...recurrenceColumns(nextRecurrence), ...(notes !== undefined ? { notes } : {}) },
        });
        if (result.count === 0) refuseConflict("This occurrence was already completed or changed. Reload to see the latest.");
        await recordRecurrenceCompleted(transaction, user.id, todo.objectId, formatDateInput(completed), formatDateInput(next));
        advancedTo = next;
      } else {
        await transaction.todo.update({
          where: { id },
          data: {
            ...(status !== undefined ? { status } : {}),
            ...(dueDate !== undefined ? { dueDate } : {}),
            ...recurrenceColumns(nextRecurrence),
            ...(notes !== undefined ? { notes } : {}),
            // completedAt tracks the status rather than being set alongside it, so
            // a To-Do reopened from Done cannot keep a completion date.
            ...(status !== undefined ? { completedAt: isOpenTodoStatus(nextStatus) ? null : new Date() } : {}),
          },
        });

        if (status !== undefined && status !== todo.status) {
          if (status === "DONE") await recordEvent(transaction, user.id, todo.objectId, "TODO_COMPLETED");
          else if (todo.status === "DONE") await recordEvent(transaction, user.id, todo.objectId, "TODO_REOPENED");
          else await recordStatusChanged(transaction, user.id, todo.objectId, todo.status, status);
        }
      }

      const fieldChanges: FieldChange[] = [];
      // A completion's own date move is the RECURRENCE_COMPLETED event, not a field change.
      if (!completingOccurrence && dueDate !== undefined && dueDate?.getTime() !== todo.dueDate?.getTime()) {
        fieldChanges.push({ fieldKey: "dueDate", fieldLabel: "Due date", oldValue: todo.dueDate ? formatDateInput(todo.dueDate) : null, newValue: dueDate ? formatDateInput(dueDate) : null });
      }
      const oldRepeats = oldRecurrence ? recurrenceLabel(oldRecurrence) : null;
      const newRepeats = nextRecurrence ? recurrenceLabel(nextRecurrence) : null;
      if (oldRepeats !== newRepeats) fieldChanges.push({ fieldKey: "recurrence", fieldLabel: "Repeats", oldValue: oldRepeats, newValue: newRepeats });
      if (notes !== undefined && notes !== todo.notes) {
        fieldChanges.push({ fieldKey: "notes", fieldLabel: "Notes", oldValue: todo.notes, newValue: notes });
      }
      await recordFieldChanges(transaction, user.id, todo.objectId, fieldChanges);
    }

    if (linkObjectIds !== undefined) {
      // Only what actually changed is written: a link left alone keeps its row,
      // so a relationship type changed from the To-Do's Kinesis Links section
      // (anything other than the default "Relates to") survives the next edit
      // here, and History records only real additions and removals.
      const existing = await transaction.objectRelationship.findMany({
        where: { userId: user.id, sourceObjectId: todo.objectId },
        select: { targetObjectId: true, type: true, customLabel: true, targetObject: { select: { name: true } } },
      });
      const targets = [...new Set(linkObjectIds.filter(Boolean))];
      const nextIds = new Set(targets);
      const existingIds = new Set(existing.map((relationship) => relationship.targetObjectId));
      const removed = existing.filter((relationship) => !nextIds.has(relationship.targetObjectId));
      const addedIds = targets.filter((targetId) => !existingIds.has(targetId));

      if (removed.length) {
        await transaction.objectRelationship.deleteMany({
          where: { userId: user.id, sourceObjectId: todo.objectId, targetObjectId: { in: removed.map((relationship) => relationship.targetObjectId) } },
        });
      }
      for (const relationship of removed) {
        await recordRelationshipRemoved(transaction, {
          userId: user.id,
          source: { objectId: todo.objectId, name: todo.name },
          target: { objectId: relationship.targetObjectId, name: relationship.targetObject.name },
          type: relationship.type,
          customLabel: relationship.customLabel,
        });
      }
      if (targets.length) {
        // A lookup with names, not just a count: either every target is the
        // user's or the whole save is refused, and the names are what the
        // paired RELATIONSHIP_ADDED events below snapshot as relatedObjectName.
        const owned = await transaction.object.findMany({ where: { id: { in: targets }, userId: user.id }, select: { id: true, name: true } });
        if (owned.length !== targets.length) refuse("One of the linked items no longer exists.");
        await transaction.objectRelationship.createMany({
          data: addedIds.map((targetObjectId) => ({
            userId: user.id, sourceObjectId: todo.objectId, targetObjectId,
            pairKey: objectPairKey(todo.objectId, targetObjectId), type: CONCERNS,
          })),
        });
        const nameOf = (targetId: string) => owned.find((object) => object.id === targetId)!.name;
        for (const targetObjectId of addedIds) {
          await recordRelationshipAdded(transaction, {
            userId: user.id,
            source: { objectId: todo.objectId, name: todo.name },
            target: { objectId: targetObjectId, name: nameOf(targetObjectId) },
            type: CONCERNS,
            customLabel: null,
          });
        }
      }
    }

    const updated: UpdatedTodo = toRecord(await transaction.todo.findFirstOrThrow({ where: { id }, select: todoSelect }));
    if (advancedTo) updated.advancedTo = advancedTo;
    return updated;
  });
}

export async function deleteTodo(id: string) {
  const user = await requireKinesisUser();
  const todo = await prisma.todo.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (!todo) return { count: 0 };
  return deleteObjects(prisma, [todo.objectId], user.id);
}

/**
 * What a To-Do may be linked to.
 *
 * Everything the user owns except other To-Dos: a To-Do concerns a thing in
 * their life, and chains of To-Dos waiting on each other are KD-025's model,
 * not something to imply with a generic link here.
 */
export async function getTodoLinkOptions(): Promise<ObjectLocation[]> {
  const user = await requireKinesisUser();
  const objects = await prisma.object.findMany({
    where: { userId: user.id, type: { not: "TODO" } },
    select: objectLocationSelect,
    orderBy: { name: "asc" },
  });
  return locateObjects(objects);
}
