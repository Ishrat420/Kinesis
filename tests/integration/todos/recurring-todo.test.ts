import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { createTodoAction, saveTodoDetailsAction, setTodoStatusAction, updateTodoDueDateAction } from "@/app/(app)/todos/actions";
import { getTodo, getTodos } from "@/lib/data/todos";
import { getCalendarItems } from "@/lib/data/calendar";
import { collectNotifications } from "@/lib/data/notification-collection";
import { getToday } from "@/lib/format/server";
import { addUtcDays, formatDateInput } from "@/lib/dates";

/**
 * KD-056: a to-do's repeat button, end to end against a real database --
 * creating and editing through the real actions, completing an occurrence
 * from every "mark done" path, the calendar's projection, notifications on
 * the owner's to-do reminder lead, and the migration's check constraints.
 */

const owner = "recurring-todo-owner";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const repeating = (name: string, dueDate: string, recurrenceRule: string, recurrenceDays = "") =>
  form({ name, dueDate, repeat: "on", recurrenceRule, recurrenceDays });

async function onlyTodo() {
  const [todo] = await getTodos();
  return todo;
}
const events = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a repeating to-do", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Recurring", lastName: "Todo", email: "recurring-todo@example.test" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  describe("creating", () => {
    it("stores the rule with its anchor day beside the due date", async () => {
      await expect(createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"))).resolves.toEqual({ created: true });
      const todo = await onlyTodo();
      expect(todo).toMatchObject({ status: "TODO", dueDate: d("2099-01-31"), recurrence: { rule: "MONTHLY", days: null, anchorDay: 31 } });
    });

    it("stays a one-off when the repeat button is off, whatever else the form carries", async () => {
      await createTodoAction({}, form({ name: "Book dentist", dueDate: "2099-01-31", repeat: "", recurrenceRule: "MONTHLY" }));
      expect((await onlyTodo()).recurrence).toBeNull();
    });

    it("refuses repeat on without a rule, a missing N, or a repeating to-do created as Done", async () => {
      await expect(createTodoAction({}, repeating("Pay rent", "2099-01-31", ""))).resolves.toEqual({ error: "Pick how often it repeats." });
      await expect(createTodoAction({}, repeating("Water plants", "2099-01-31", "EVERY_N_DAYS", ""))).resolves.toEqual({ error: "N must be a whole number from 1 to 999." });
      await expect(createTodoAction({}, form({ name: "Pay rent", dueDate: "2099-01-31", status: "DONE", repeat: "on", recurrenceRule: "WEEKLY" }))).resolves.toEqual({ error: "A repeating to-do can't start as Done." });
      await expect(prisma.todo.count({ where: { userId: owner } })).resolves.toBe(0);
    });
  });

  describe("marking it done", () => {
    it("moves the date to the next occurrence, keeps it open, and records the occurrence -- never TODO_COMPLETED", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();

      await expect(setTodoStatusAction(todo.id, "DONE", "2099-01-31")).resolves.toEqual({ nextDueDate: "2099-02-28" });
      await expect(setTodoStatusAction(todo.id, "DONE", "2099-02-28")).resolves.toEqual({ nextDueDate: "2099-03-31" });

      expect(await getTodo(todo.id)).toMatchObject({ status: "TODO", completedAt: null, dueDate: d("2099-03-31"), recurrence: { anchorDay: 31 } });
      expect((await events(todo.objectId)).map(({ eventType, oldValue, newValue }) => ({ eventType, oldValue, newValue }))).toEqual([
        { eventType: "ITEM_CREATED", oldValue: null, newValue: null },
        { eventType: "RECURRENCE_COMPLETED", oldValue: "2099-01-31", newValue: "2099-02-28" },
        { eventType: "RECURRENCE_COMPLETED", oldValue: "2099-02-28", newValue: "2099-03-31" },
      ]);
    });

    it("refuses a stale completion instead of skipping an occurrence", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();
      await setTodoStatusAction(todo.id, "DONE", "2099-01-31");

      await expect(setTodoStatusAction(todo.id, "DONE", "2099-01-31")).resolves.toMatchObject({ conflict: true });
      expect((await getTodo(todo.id))?.dueDate).toEqual(d("2099-02-28"));
    });

    it("catches a long-overdue to-do up to today or later, and moves a Waiting one back to To do", async () => {
      await createTodoAction({}, form({ name: "Weekly review", dueDate: "2000-01-03", status: "WAITING", repeat: "on", recurrenceRule: "WEEKLY" }));
      const todo = await onlyTodo();
      const today = await getToday();

      const result = await setTodoStatusAction(todo.id, "DONE", "2000-01-03");

      const next = d(result.nextDueDate!);
      expect(next.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(next.getTime() - today.getTime()).toBeLessThan(7 * 86_400_000);
      expect((await getTodo(todo.id))?.status).toBe("TODO");
    });

    it("completes an occurrence from the edit form too, when its status is set to Done", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();

      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "DONE", dueDate: "2099-01-31", repeat: "on", recurrenceRule: "MONTHLY" }));

      expect(await getTodo(todo.id)).toMatchObject({ status: "TODO", dueDate: d("2099-02-28") });
    });

    it("still closes a one-off to-do as before", async () => {
      await createTodoAction({}, form({ name: "Book dentist", dueDate: "2099-01-31" }));
      const todo = await onlyTodo();
      await expect(setTodoStatusAction(todo.id, "DONE", "2099-01-31")).resolves.toEqual({});
      expect((await getTodo(todo.id))?.status).toBe("DONE");
    });
  });

  describe("editing", () => {
    it("keeps the anchor day when the form is re-saved unchanged, and logs a Repeats change when the rule changes", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();
      await setTodoStatusAction(todo.id, "DONE", "2099-01-31"); // now 28 Feb, anchored on the 31st

      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "TODO", dueDate: "2099-02-28", repeat: "on", recurrenceRule: "MONTHLY" }));
      expect((await getTodo(todo.id))?.recurrence).toEqual({ rule: "MONTHLY", days: null, anchorDay: 31 });

      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "TODO", dueDate: "2099-02-28", repeat: "on", recurrenceRule: "EVERY_N_DAYS", recurrenceDays: "10" }));
      expect((await getTodo(todo.id))?.recurrence).toEqual({ rule: "EVERY_N_DAYS", days: 10, anchorDay: null });
      const repeatsChanges = (await events(todo.objectId)).filter((event) => event.fieldKey === "recurrence");
      expect(repeatsChanges.map(({ oldValue, newValue }) => ({ oldValue, newValue }))).toEqual([{ oldValue: "Every month", newValue: "Every 10 days" }]);
    });

    it("re-anchors a monthly rule when the date is rescheduled", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();
      await updateTodoDueDateAction(todo.id, {}, form({ dueDate: "2099-02-15" }));
      expect((await getTodo(todo.id))?.recurrence).toEqual({ rule: "MONTHLY", days: null, anchorDay: 15 });
    });

    it("turning the button off makes it a one-off, and clearing the date clears the repeat", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();
      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "TODO", dueDate: "2099-01-31", repeat: "" }));
      expect((await getTodo(todo.id))?.recurrence).toBeNull();

      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "TODO", dueDate: "2099-01-31", repeat: "on", recurrenceRule: "WEEKLY" }));
      await saveTodoDetailsAction(todo.id, {}, form({ name: "Pay rent", status: "TODO", dueDate: "" }));
      expect(await getTodo(todo.id)).toMatchObject({ dueDate: null, recurrence: null });
    });
  });

  describe("the calendar", () => {
    it("projects later occurrences with the repeat icon; only the current one has a reminder pin", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC", todoReminderLeadDays: 3 } });
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const todo = await onlyTodo();

      const window = await getCalendarItems(d("2099-01-26"), new Date("2099-03-08T23:59:59.999Z"));
      const mine = window.filter((entry) => entry.sourceObjectId === todo.id);
      expect(mine.map(({ id, date, recurring, sourceType }) => ({ id, date, recurring, sourceType }))).toEqual([
        { id: `todo-reminder-${todo.id}`, date: "2099-01-28", recurring: undefined, sourceType: "REMINDER" },
        { id: `todo-due-${todo.id}`, date: "2099-01-31", recurring: true, sourceType: "TODO" },
        { id: `todo-due-${todo.id}-2099-02-28`, date: "2099-02-28", recurring: true, sourceType: "TODO" },
      ]);
    });

    it("never draws an occurrence before the current due date", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "MONTHLY"));
      const window = await getCalendarItems(d("2098-11-01"), new Date("2098-12-31T23:59:59.999Z"));
      expect(window.filter((entry) => entry.sourceType === "TODO")).toEqual([]);
    });
  });

  describe("notifications", () => {
    const todoNotes = async () => (await collectNotifications(owner)).filter((note) => note.source === "todo");

    it("opens a reminder on the owner's to-do lead time, and notifies afresh for the next occurrence once completed", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC", todoReminderLeadDays: 10 } });
      const today = await getToday();
      const overdue = addUtcDays(today, -1);
      await createTodoAction({}, repeating("Water plants", formatDateInput(overdue), "EVERY_N_DAYS", "3"));
      await createTodoAction({}, repeating("Pay rent", formatDateInput(addUtcDays(today, 20)), "MONTHLY"));
      const plants = (await getTodos()).find((todo) => todo.name === "Water plants")!;

      const before = await todoNotes();
      expect(before.map((note) => note.sourceId)).toEqual([plants.id]);

      await setTodoStatusAction(plants.id, "DONE", formatDateInput(overdue));

      const after = await todoNotes();
      expect(after.map((note) => ({ id: note.sourceId, type: note.type, due: formatDateInput(note.expiryDate!) }))).toEqual([
        { id: plants.id, type: "REMINDER_DUE", due: formatDateInput(addUtcDays(overdue, 3)) },
      ]);
      expect(after[0].key).not.toBe(before[0].key);
    });
  });

  describe("database backstop", () => {
    it("refuses a repeating to-do stored as Done, or a rule without a date", async () => {
      await createTodoAction({}, repeating("Pay rent", "2099-01-31", "WEEKLY"));
      const todo = await onlyTodo();
      await expect(prisma.todo.update({ where: { id: todo.id }, data: { status: "DONE" } })).rejects.toThrow();
      await expect(prisma.todo.update({ where: { id: todo.id }, data: { dueDate: null } })).rejects.toThrow();
      await expect(prisma.todo.update({ where: { id: todo.id }, data: { recurrence: "EVERY_N_DAYS" } })).rejects.toThrow();
    });
  });
});
