import type { TodoStatus } from "@prisma/client";

/**
 * The three states a standalone To-Do can be in (KD-008).
 *
 * Deliberately short of a workflow: ADR-009 is explicit that a To-Do is an
 * action the user recorded, not a ticket in a process. The richer "who has the
 * ball" model belongs to KD-025 and will extend this list rather than replace
 * it, so callers read labels and order from here instead of hard-coding them.
 */
const TODO_STATUS_CONFIG = {
  TODO: { label: "To do", order: 10, open: true, dotClass: "bg-zinc-400" },
  WAITING: { label: "Waiting", order: 20, open: true, dotClass: "bg-amber-500" },
  DONE: { label: "Done", order: 30, open: false, dotClass: "bg-emerald-500" },
} as const satisfies Record<TodoStatus, { label: string; order: number; open: boolean; dotClass: string }>;

/** The statuses in the order a picker should offer them. */
export const TODO_STATUSES = (Object.keys(TODO_STATUS_CONFIG) as TodoStatus[])
  .sort((first, second) => TODO_STATUS_CONFIG[first].order - TODO_STATUS_CONFIG[second].order);

export const todoStatusLabel = (status: TodoStatus) => TODO_STATUS_CONFIG[status].label;

/** The colour dot shown next to a status in a selector -- grey for "not started yet", amber for waiting, green for done. */
export const todoStatusDotClass = (status: TodoStatus) => TODO_STATUS_CONFIG[status].dotClass;

/**
 * Whether the To-Do is still asking something of the user. Everything that
 * counts an outstanding workload -- the To-Do page's counts, Needs Attention,
 * Upcoming & Due -- asks this rather than testing `status !== "DONE"`, so a
 * status added later declares its own answer in one place.
 */
export const isOpenTodoStatus = (status: TodoStatus) => TODO_STATUS_CONFIG[status].open;

/** Narrows an unvalidated form value; anything unrecognised is not a status. */
export const isTodoStatus = (value: unknown): value is TodoStatus =>
  typeof value === "string" && value in TODO_STATUS_CONFIG;
