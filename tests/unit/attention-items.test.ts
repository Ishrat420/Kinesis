import { describe, expect, it } from "vitest";
import {
  isOverdueForNeedsAttention,
  documentUpcomingPhase,
  milestoneUpcomingPhase,
  customItemUpcomingPhase,
  todoUpcomingPhase,
  relationshipUpcomingPhase,
  goalUpcomingPhase,
} from "@/lib/attention/items";

/**
 * KD-017 Phase 1: these are the small, per-surface status functions built to
 * ADR-010 (Notification And Reminders Awareness Surfaces) rather than to a
 * single universal cutoff -- see KD-017 Phase 0 for why unifying to one rule
 * would have been wrong. Each block below is pinned to the ADR line or table
 * it implements, so a future change to either has to change both on purpose.
 */

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = at("2026-06-15");

describe("isOverdueForNeedsAttention (ADR-010 line 26: strict < today, no exceptions)", () => {
  it("does not count the deadline's own day as overdue, for any kind", () => {
    expect(isOverdueForNeedsAttention({ kind: "document", id: "d", name: "Passport", type: "Identity", expiryDate: today, prompt: 180 }, today)).toBe(false);
    expect(isOverdueForNeedsAttention({ kind: "milestone", id: "m", name: "M", dueDate: today, goalId: "g", goalName: "G" }, today)).toBe(false);
    expect(isOverdueForNeedsAttention({ kind: "custom", id: "c", name: "C", dueDate: today, moduleId: "mod", moduleName: "Mod", moduleIcon: "star", moduleColor: "#000" }, today)).toBe(false);
    expect(isOverdueForNeedsAttention({ kind: "todo", id: "t", name: "T", dueDate: today }, today)).toBe(false);
    expect(isOverdueForNeedsAttention({ kind: "goal", id: "g", name: "Move house", targetDate: today }, today)).toBe(false);
  });

  it("counts the day after as overdue, for any kind", () => {
    const yesterday = at("2026-06-14");
    expect(isOverdueForNeedsAttention({ kind: "document", id: "d", name: "Passport", type: "Identity", expiryDate: yesterday, prompt: 180 }, today)).toBe(true);
    expect(isOverdueForNeedsAttention({ kind: "milestone", id: "m", name: "M", dueDate: yesterday, goalId: "g", goalName: "G" }, today)).toBe(true);
    expect(isOverdueForNeedsAttention({ kind: "custom", id: "c", name: "C", dueDate: yesterday, moduleId: "mod", moduleName: "Mod", moduleIcon: "star", moduleColor: "#000" }, today)).toBe(true);
    expect(isOverdueForNeedsAttention({ kind: "todo", id: "t", name: "T", dueDate: yesterday }, today)).toBe(true);
    expect(isOverdueForNeedsAttention({ kind: "goal", id: "g", name: "Move house", targetDate: yesterday }, today)).toBe(true);
  });
});

describe("documentUpcomingPhase (ADR-010: expiry is one universal boundary, > expiryDate)", () => {
  const document = (expiryDate: Date, prompt = 30) => ({ kind: "document" as const, id: "d", name: "Passport", type: "Identity", expiryDate, prompt });

  it("is not yet overdue on the expiry day itself", () => {
    expect(documentUpcomingPhase(document(today), today, true)).not.toBe("overdue");
  });

  it("is overdue the day after expiry, and survives reminders being off", () => {
    const expired = document(at("2026-06-01"));
    expect(documentUpcomingPhase(expired, today, true)).toBe("overdue");
    expect(documentUpcomingPhase(expired, today, false)).toBe("overdue");
  });

  it("is due-soon once inside the reminder window, only while reminders are on", () => {
    const withinWindow = document(at("2026-06-20"), 30);
    expect(documentUpcomingPhase(withinWindow, today, true)).toBe("due-soon");
    expect(documentUpcomingPhase(withinWindow, today, false)).toBeNull();
  });

  it("is nothing before the reminder window opens", () => {
    const farOut = document(at("2027-06-20"), 30);
    expect(documentUpcomingPhase(farOut, today, true)).toBeNull();
  });
});

describe("milestone/custom-item upcoming phase (ADR-010: overdue survives remindersEnabled=false, the KD-017 Phase 0 bug fix)", () => {
  const milestone = (dueDate: Date) => ({ kind: "milestone" as const, id: "m", name: "M", dueDate, goalId: "g", goalName: "G" });
  const customItem = (dueDate: Date) => ({ kind: "custom" as const, id: "c", name: "C", dueDate, moduleId: "mod", moduleName: "Mod", moduleIcon: "star", moduleColor: "#000" });

  it("reads the due date itself as due-soon, not overdue -- matching Needs Attention's boundary", () => {
    expect(milestoneUpcomingPhase(milestone(today), today, 30, true)).toBe("due-soon");
    expect(customItemUpcomingPhase(customItem(today), today, 30, true)).toBe("due-soon");
  });

  it("is overdue the day after, and survives reminders being off -- getUpcomingAndDue/collectNotifications currently drop this", () => {
    const overdue = at("2026-06-01");
    expect(milestoneUpcomingPhase(milestone(overdue), today, 30, false)).toBe("overdue");
    expect(customItemUpcomingPhase(customItem(overdue), today, 30, false)).toBe("overdue");
  });

  it("blocks only the due-soon phase when reminders are off", () => {
    const dueSoon = at("2026-06-20");
    expect(milestoneUpcomingPhase(milestone(dueSoon), today, 30, false)).toBeNull();
    expect(customItemUpcomingPhase(customItem(dueSoon), today, 30, false)).toBeNull();
  });

  it("is nothing before the lead window opens", () => {
    expect(milestoneUpcomingPhase(milestone(at("2027-06-20")), today, 30, true)).toBeNull();
  });
});

describe("todoUpcomingPhase (ADR-010 line 123: TODO_DUE is a statement of fact, the one deliberate exception)", () => {
  const todo = (dueDate: Date) => ({ kind: "todo" as const, id: "t", name: "T", dueDate });

  it("reads the due date itself as already due, unlike a milestone or custom item", () => {
    expect(todoUpcomingPhase(todo(today), today, 30, true)).toBe("overdue");
  });

  it("is overdue after the due date, and survives reminders being off", () => {
    expect(todoUpcomingPhase(todo(at("2026-06-01")), today, 30, false)).toBe("overdue");
  });

  it("blocks only the due-soon phase when reminders are off", () => {
    expect(todoUpcomingPhase(todo(at("2026-06-20")), today, 30, false)).toBeNull();
    expect(todoUpcomingPhase(todo(at("2026-06-20")), today, 30, true)).toBe("due-soon");
  });
});

describe("relationshipUpcomingPhase (ADR-010 Other Exceptions #1: never overdue; gated fully on remindersEnabled)", () => {
  const importantDate = (date: Date, repeatsYearly = false) => ({ kind: "relationship" as const, id: "r", label: "Birthday", date, repeatsYearly, personName: "Alex", personObjectId: "object-alex", pairedWithName: null });

  it("is due-soon inside the lead window", () => {
    expect(relationshipUpcomingPhase(importantDate(at("2026-06-20")), today, 30, true)).toBe("due-soon");
  });

  it("is blocked entirely when reminders are off, even for an imminent date", () => {
    expect(relationshipUpcomingPhase(importantDate(at("2026-06-16")), today, 30, false)).toBeNull();
  });

  it("is nothing outside the lead window", () => {
    expect(relationshipUpcomingPhase(importantDate(at("2027-06-20")), today, 30, true)).toBeNull();
  });

  it("is nothing for a one-off date that has already passed -- it never rolls forward", () => {
    expect(relationshipUpcomingPhase(importantDate(at("2026-01-01")), today, 30, true)).toBeNull();
  });

  it("rolls a yearly date forward to next year rather than reporting it overdue", () => {
    const pastThisYear = importantDate(at("2026-01-01"), true);
    expect(relationshipUpcomingPhase(pastThisYear, today, 30, true)).toBeNull();
    expect(relationshipUpcomingPhase(importantDate(at("2026-07-01"), true), today, 30, true)).toBe("due-soon");
  });
});

describe("goalUpcomingPhase (KD-028; ADR-010 Other Exceptions #3: no advance phase, ever)", () => {
  const goal = (targetDate: Date) => ({ kind: "goal" as const, id: "g", name: "Move house", targetDate });

  it("is not yet overdue on the target date itself", () => {
    expect(goalUpcomingPhase(goal(today), today)).toBeNull();
  });

  it("is nothing before the target date, however close -- there is no due-soon phase to enter", () => {
    expect(goalUpcomingPhase(goal(at("2026-06-16")), today)).toBeNull();
  });

  it("is overdue the day after the target date", () => {
    expect(goalUpcomingPhase(goal(at("2026-06-14")), today)).toBe("overdue");
  });
});
