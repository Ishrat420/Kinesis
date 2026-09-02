import { describe, expect, it } from "vitest";
import { TODO_STATUSES, isOpenTodoStatus, isTodoStatus, todoStatusLabel } from "@/lib/todos/status";

/**
 * ADR-009 keeps a To-Do's states deliberately short of a workflow. What matters
 * to the rest of the application is which of them still ask something of the
 * user, since that is what the attention surfaces count.
 */

describe("To-Do statuses", () => {
  it("offers the three states KD-008 asks for, in the order a picker should show them", () => {
    expect(TODO_STATUSES).toEqual(["TODO", "WAITING", "DONE"]);
    expect(TODO_STATUSES.map(todoStatusLabel)).toEqual(["To do", "Waiting", "Done"]);
  });

  it("treats waiting as still open: the ball is elsewhere, but the To-Do is not finished", () => {
    expect(isOpenTodoStatus("TODO")).toBe(true);
    expect(isOpenTodoStatus("WAITING")).toBe(true);
    expect(isOpenTodoStatus("DONE")).toBe(false);
  });

  it("narrows an unvalidated form value rather than trusting it as a status", () => {
    expect(isTodoStatus("WAITING")).toBe(true);
    expect(isTodoStatus("waiting")).toBe(false);
    expect(isTodoStatus("BLOCKED")).toBe(false);
    expect(isTodoStatus(null)).toBe(false);
  });
});
