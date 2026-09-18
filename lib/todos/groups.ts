import type { TodoStatus } from "@prisma/client";
import { differenceInCalendarDays } from "@/lib/dates";
import { isOpenTodoStatus } from "./status";

export type TodoUrgencyGroup = "overdue" | "due-soon" | "later" | "no-date" | "completed";

/** Due today or within this many days counts as "Due soon" rather than "Later". */
const DUE_SOON_WINDOW_DAYS = 3;

const GROUP_LABELS: Record<TodoUrgencyGroup, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  later: "Later",
  "no-date": "No due date",
  completed: "Completed",
};

const GROUP_ORDER: TodoUrgencyGroup[] = ["overdue", "due-soon", "later", "no-date", "completed"];

function groupOf(status: TodoStatus, dueDate: Date | null, today: Date): TodoUrgencyGroup {
  if (!isOpenTodoStatus(status)) return "completed";
  if (!dueDate) return "no-date";
  const days = differenceInCalendarDays(dueDate, today);
  if (days < 0) return "overdue";
  return days <= DUE_SOON_WINDOW_DAYS ? "due-soon" : "later";
}

/**
 * Buckets an already-sorted To-Do list by urgency, so a to-do three days
 * overdue no longer reads with the same weight as one due a month out --
 * everything on the board used to carry identical visual weight regardless of
 * how close its due date was. Only non-empty groups are returned, always in
 * the same order, and each group keeps the list's existing relative order
 * (`getTodos`'s own sort) rather than re-sorting.
 */
export function groupTodosByUrgency<T extends { status: TodoStatus; dueDate: Date | null }>(
  todos: T[],
  today: Date,
): { key: TodoUrgencyGroup; label: string; todos: T[] }[] {
  const buckets: Record<TodoUrgencyGroup, T[]> = { overdue: [], "due-soon": [], later: [], "no-date": [], completed: [] };
  for (const todo of todos) buckets[groupOf(todo.status, todo.dueDate, today)].push(todo);
  return GROUP_ORDER.map((key) => ({ key, label: GROUP_LABELS[key], todos: buckets[key] })).filter((group) => group.todos.length > 0);
}
