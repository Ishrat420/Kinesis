import { describe, expect, it } from "vitest";
import { groupTodosByUrgency } from "@/lib/todos/groups";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = at("2026-06-15");

const todo = (id: string, status: "TODO" | "WAITING" | "DONE", dueDate: string | null) => ({
  id, status, dueDate: dueDate ? at(dueDate) : null,
});

describe("groupTodosByUrgency: bucketing a to-do list by how urgent its due date is", () => {
  it("puts a past due date in Overdue, whatever its status", () => {
    const groups = groupTodosByUrgency([todo("a", "TODO", "2026-06-14"), todo("b", "WAITING", "2026-06-01")], today);
    expect(groups.map((group) => group.key)).toEqual(["overdue"]);
    expect(groups[0].todos.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("puts today and the next few days in Due soon, not Overdue or Later", () => {
    const groups = groupTodosByUrgency([todo("today", "TODO", "2026-06-15"), todo("soon", "TODO", "2026-06-18")], today);
    expect(groups.map((group) => group.key)).toEqual(["due-soon"]);
  });

  it("puts a due date past the Due soon window in Later", () => {
    const groups = groupTodosByUrgency([todo("a", "TODO", "2026-06-19")], today);
    expect(groups.map((group) => group.key)).toEqual(["later"]);
  });

  it("puts an undated open to-do in No due date, not Later", () => {
    const groups = groupTodosByUrgency([todo("a", "TODO", null)], today);
    expect(groups.map((group) => group.key)).toEqual(["no-date"]);
  });

  it("puts a Done to-do in Completed regardless of its due date", () => {
    const groups = groupTodosByUrgency([todo("a", "DONE", "2026-06-01"), todo("b", "DONE", null)], today);
    expect(groups.map((group) => group.key)).toEqual(["completed"]);
    expect(groups[0].todos).toHaveLength(2);
  });

  it("orders the groups Overdue, Due soon, Later, No due date, Completed -- omitting any that are empty", () => {
    const groups = groupTodosByUrgency([
      todo("done", "DONE", null),
      todo("later", "TODO", "2026-06-25"),
      todo("overdue", "TODO", "2026-06-01"),
      todo("no-date", "WAITING", null),
      todo("soon", "TODO", "2026-06-16"),
    ], today);

    expect(groups.map((group) => group.key)).toEqual(["overdue", "due-soon", "later", "no-date", "completed"]);
  });

  it("keeps each group's incoming relative order rather than re-sorting", () => {
    const groups = groupTodosByUrgency([todo("z", "TODO", "2026-06-25"), todo("a", "TODO", "2026-06-20")], today);
    expect(groups[0].todos.map((item) => item.id)).toEqual(["z", "a"]);
  });
});
