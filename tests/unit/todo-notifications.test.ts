import { describe, expect, it, vi } from "vitest";

// The reconcilers reach Prisma, but the candidate builder under test is pure;
// the client is stubbed so it runs without a database.
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));

const { getTodoNotificationCandidate } = await import("@/lib/notifications/engine");

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

const todo = (dueDate: string | null, status: "TODO" | "WAITING" | "DONE" = "TODO") => ({
  id: "todo-1",
  name: "Renew licence",
  dueDate: dueDate ? at(dueDate) : null,
  status,
});

describe("getTodoNotificationCandidate: a To-Do speaks on its due date", () => {
  it("raises nothing for an undated To-Do", () => {
    // ADR-009: capture must not require a deadline, so most To-Dos never have
    // one to alert from.
    expect(getTodoNotificationCandidate(todo(null), at("2026-06-01"))).toBeNull();
  });

  it("raises nothing before the due date -- there is no lead time to honour", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01"), at("2026-05-31"))).toBeNull();
    expect(getTodoNotificationCandidate(todo("2026-06-01"), at("2026-05-02"))).toBeNull();
  });

  it("raises the alert on the due date itself", () => {
    const candidate = getTodoNotificationCandidate(todo("2026-06-01"), at("2026-06-01"));
    expect(candidate?.type).toBe("TODO_DUE");
    expect(candidate?.message).toBe("Renew licence is due today");
  });

  it("keeps the alert current while the To-Do stays overdue", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01"), at("2026-06-04"))?.message)
      .toBe("Renew licence is 3 days overdue");
  });

  it("still alerts a To-Do that is waiting on someone else", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01", "WAITING"), at("2026-06-04"))?.type)
      .toBe("TODO_DUE");
  });

  it("raises nothing once the To-Do is done, however overdue it was", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01", "DONE"), at("2026-06-04"))).toBeNull();
  });

  it("points at the To-Do board and names itself in the bell", () => {
    const candidate = getTodoNotificationCandidate(todo("2026-06-01"), at("2026-06-01"));
    expect(candidate?.actionUrl).toBe("/todos");
    expect(candidate?.documentName).toBe("Renew licence");
    expect(candidate?.documentType).toBe("To-do");
  });

  it("keeps the due date in UTC so it never shifts a day", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01"), at("2026-06-01"))?.expiryDate.toISOString())
      .toBe("2026-06-01T00:00:00.000Z");
  });

  it("opens its window on the due date, having no earlier date to open at", () => {
    expect(getTodoNotificationCandidate(todo("2026-06-01"), at("2026-06-04"))?.reminderAt?.toISOString())
      .toBe("2026-06-01T00:00:00.000Z");
  });
});
