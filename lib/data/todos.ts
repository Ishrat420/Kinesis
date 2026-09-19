import type { Prisma, TodoStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { deleteObjects, objectFor } from "./objects";
import { recordEvent, recordFieldChanges, recordRelationshipAdded, recordRelationshipRemoved, recordStatusChanged, type FieldChange } from "./object-events";
import { requireKinesisUser } from "@/lib/auth";
import { objectPairKey } from "@/lib/objects/relationships";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { isOpenTodoStatus } from "@/lib/todos/status";
import { refuse } from "@/lib/actions/refusal";
import { formatDateInput } from "@/lib/dates";

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
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  /** The objects this To-Do concerns, resolved to where each one lives. */
  links: ObjectLocation[];
  /** This To-Do's own Object identity -- for its detail page's History section (KD-048). */
  objectId: string;
};

const todoSelect = {
  id: true, name: true, status: true, dueDate: true, completedAt: true, notes: true, createdAt: true, objectId: true,
  object: {
    select: {
      outgoingRelationships: { select: { targetObject: { select: objectLocationSelect } }, orderBy: { createdAt: "asc" } },
    },
  },
} as const satisfies Prisma.TodoSelect;

type TodoRow = Prisma.TodoGetPayload<{ select: typeof todoSelect }>;

const toRecord = ({ object, ...todo }: TodoRow): TodoRecord => ({
  ...todo,
  links: locateObjects(object.outgoingRelationships.map((relationship) => relationship.targetObject)),
});

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

export type NewTodoDetails = { status?: TodoStatus; dueDate?: Date | null; notes?: string | null; linkObjectIds?: string[] };

/**
 * The in-page "Add to-do" button's create, as opposed to quick capture's
 * title-only `captureTodo` above: status, due date, notes and links go in
 * with the title in one transaction, so a to-do with an unresolved link is
 * never left half-created.
 */
export async function createTodo(name: string, { status = "TODO", dueDate = null, notes = null, linkObjectIds = [] }: NewTodoDetails = {}) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.create({
      data: {
        id: crypto.randomUUID(),
        name,
        status,
        dueDate,
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

export type TodoDetails = { status?: TodoStatus; dueDate?: Date | null; notes?: string | null; linkObjectIds?: string[] };

/**
 * The "Add details" step. Every field is optional and independent: a caller
 * that only knows the status leaves the rest alone rather than clearing it.
 *
 * `linkObjectIds` is the exception to that. It is the complete set of objects
 * the To-Do concerns, so an empty array means "no longer concerns anything" --
 * a choice the user can make, and applied -- while `undefined` leaves the
 * existing links alone.
 */
export async function updateTodoDetails(id: string, { status, dueDate, notes, linkObjectIds }: TodoDetails) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.findFirst({ where: { id, userId: user.id }, select: { objectId: true, name: true, status: true, dueDate: true, notes: true } });
    if (!todo) refuse("This to-do no longer exists.");

    if (status !== undefined || dueDate !== undefined || notes !== undefined) {
      const nextStatus = status ?? todo.status;
      await transaction.todo.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
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

      const fieldChanges: FieldChange[] = [];
      if (dueDate !== undefined && dueDate?.getTime() !== todo.dueDate?.getTime()) {
        fieldChanges.push({ fieldKey: "dueDate", fieldLabel: "Due date", oldValue: todo.dueDate ? formatDateInput(todo.dueDate) : null, newValue: dueDate ? formatDateInput(dueDate) : null });
      }
      if (notes !== undefined && notes !== todo.notes) {
        fieldChanges.push({ fieldKey: "notes", fieldLabel: "Notes", oldValue: todo.notes, newValue: notes });
      }
      await recordFieldChanges(transaction, user.id, todo.objectId, fieldChanges);
    }

    if (linkObjectIds !== undefined) {
      // The *rows* are replaced rather than reconciled -- a To-Do concerns few
      // enough things that working out the difference would cost more than
      // rewriting them -- but the *history* still needs a real diff: naively
      // recording every recreated row as a fresh RELATIONSHIP_ADDED would show
      // a link that was never touched as removed and re-added at the same
      // instant, which is exactly the noise this model exists to avoid.
      const existing = await transaction.objectRelationship.findMany({
        where: { userId: user.id, sourceObjectId: todo.objectId },
        select: { targetObjectId: true, targetObject: { select: { name: true } } },
      });
      const targets = [...new Set(linkObjectIds.filter(Boolean))];
      const nextIds = new Set(targets);
      const existingIds = new Set(existing.map((relationship) => relationship.targetObjectId));
      const removed = existing.filter((relationship) => !nextIds.has(relationship.targetObjectId));
      const addedIds = targets.filter((targetId) => !existingIds.has(targetId));

      await transaction.objectRelationship.deleteMany({ where: { userId: user.id, sourceObjectId: todo.objectId } });
      for (const relationship of removed) {
        await recordRelationshipRemoved(transaction, {
          userId: user.id,
          source: { objectId: todo.objectId, name: todo.name },
          target: { objectId: relationship.targetObjectId, name: relationship.targetObject.name },
          type: CONCERNS,
          customLabel: null,
        });
      }
      if (targets.length) {
        // A lookup with names, not just a count: either every target is the
        // user's or the whole save is refused, and the names are what the
        // paired RELATIONSHIP_ADDED events below snapshot as relatedObjectName.
        const owned = await transaction.object.findMany({ where: { id: { in: targets }, userId: user.id }, select: { id: true, name: true } });
        if (owned.length !== targets.length) refuse("One of the linked items no longer exists.");
        await transaction.objectRelationship.createMany({
          data: targets.map((targetObjectId) => ({
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

    return transaction.todo.findFirstOrThrow({ where: { id }, select: todoSelect }).then(toRecord);
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
