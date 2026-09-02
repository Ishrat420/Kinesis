import type { Prisma, TodoStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { deleteObjects, objectFor } from "./objects";
import { requireKinesisUser } from "@/lib/auth";
import { objectPairKey } from "@/lib/objects/relationships";
import { locateObjects, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";
import { isOpenTodoStatus } from "@/lib/todos/status";

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
  createdAt: Date;
  /** The objects this To-Do concerns, resolved to where each one lives. */
  links: ObjectLocation[];
};

const todoSelect = {
  id: true, name: true, status: true, dueDate: true, completedAt: true, createdAt: true,
  object: {
    select: {
      outgoingRelationships: { select: { targetObject: { select: objectLocationSelect } } },
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
  return prisma.todo.create({
    data: { id: crypto.randomUUID(), name, user: { connect: { id: user.id } }, object: objectFor.todo(name, user.id) },
    select: { id: true, name: true },
  });
}

export type TodoDetails = { status?: TodoStatus; dueDate?: Date | null; linkObjectId?: string | null };

/**
 * The "Add details" step. Every field is optional and independent: a caller
 * that only knows the status leaves the rest alone rather than clearing it.
 *
 * `linkObjectId` is the exception to that -- an explicit null means "no longer
 * concerns anything", which is a value the user can choose, so it is applied
 * while `undefined` is not.
 */
export async function updateTodoDetails(id: string, { status, dueDate, linkObjectId }: TodoDetails) {
  const user = await requireKinesisUser();
  return prisma.$transaction(async (transaction) => {
    const todo = await transaction.todo.findFirst({ where: { id, userId: user.id }, select: { objectId: true, status: true } });
    if (!todo) throw new Error("To-Do not found");

    if (status !== undefined || dueDate !== undefined) {
      const nextStatus = status ?? todo.status;
      await transaction.todo.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
          // completedAt tracks the status rather than being set alongside it, so
          // a To-Do reopened from Done cannot keep a completion date.
          ...(status !== undefined ? { completedAt: isOpenTodoStatus(nextStatus) ? null : new Date() } : {}),
        },
      });
    }

    if (linkObjectId !== undefined) {
      await transaction.objectRelationship.deleteMany({ where: { userId: user.id, sourceObjectId: todo.objectId } });
      if (linkObjectId) {
        const target = await transaction.object.findFirst({ where: { id: linkObjectId, userId: user.id }, select: { id: true } });
        if (!target) throw new Error("Linked object not found");
        await transaction.objectRelationship.create({
          data: { userId: user.id, sourceObjectId: todo.objectId, targetObjectId: target.id, pairKey: objectPairKey(todo.objectId, target.id), type: CONCERNS },
        });
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
