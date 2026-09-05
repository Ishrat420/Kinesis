import { describe, expect, it, vi } from "vitest";

// The engine's reconcilers reach Prisma; only its pure candidate builders are
// read here, so the client is stubbed rather than run.
vi.mock("@/lib/data/prisma", () => ({ prisma: {} }));

import { reminderOpensAt, reminderPinDetail, reminderPinTitle } from "@/lib/calendar/reminders";

const {
  getDocumentNotificationCandidate,
  getMilestoneNotificationCandidate,
  getRelationshipDateNotificationCandidate,
  getCustomItemNotificationCandidate,
} = await import("@/lib/notifications/engine");

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const day = (date: Date) => date.toISOString().slice(0, 10);

describe("reminderOpensAt: a lead-up date derived from the record, not read from a row", () => {
  it("opens a lead-days reminder that many days before the deadline", () => {
    expect(day(reminderOpensAt(at("2026-07-01"), { kind: "leadDays", days: 30 }))).toBe("2026-06-01");
  });

  it("opens on the deadline itself when the lead is zero", () => {
    expect(day(reminderOpensAt(at("2026-07-01"), { kind: "leadDays", days: 0 }))).toBe("2026-07-01");
  });

  it("reads a document's prompt as the calendar period it represents, not as a day count", () => {
    // 3 months before 31 May is 28 February, which a 90-day subtraction would
    // miss by two days. Flattening both leads into days would move this pin.
    expect(day(reminderOpensAt(at("2026-05-31"), { kind: "documentPrompt", prompt: 90 }))).toBe("2026-02-28");
    expect(day(reminderOpensAt(at("2026-05-31"), { kind: "leadDays", days: 90 }))).toBe("2026-03-02");
  });

  it("handles a document prompt that really is a day count", () => {
    expect(day(reminderOpensAt(at("2026-07-01"), { kind: "documentPrompt", prompt: 14 }))).toBe("2026-06-17");
  });

  it("ignores any time of day on the deadline, so a pin is always a whole day", () => {
    expect(reminderOpensAt(new Date("2026-07-01T16:45:00.000Z"), { kind: "leadDays", days: 30 }).toISOString())
      .toBe("2026-06-01T00:00:00.000Z");
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(day(reminderOpensAt(at("2027-01-10"), { kind: "leadDays", days: 30 }))).toBe("2026-12-11");
  });

  it("lands on 29 February in a leap year rather than skipping it", () => {
    expect(day(reminderOpensAt(at("2028-03-01"), { kind: "leadDays", days: 1 }))).toBe("2028-02-29");
  });
});

/**
 * The point of the shared helper: the day the calendar pins and the day the
 * bell starts speaking are the same day, by construction. If either side ever
 * changes how a lead is measured, these fail rather than the two quietly
 * disagreeing.
 */
describe("reminderOpensAt agrees with the notification engine, for every source", () => {
  it("matches a document's reminderAt", () => {
    const expiryDate = at("2026-05-31");
    // Evaluated on the reminder day itself, which is the only day the engine
    // will hand back a candidate to compare against.
    const candidate = getDocumentNotificationCandidate(
      { id: "document-1", name: "Passport", type: "Identity", expiryDate, prompt: 90 },
      at("2026-02-28"),
    );

    expect(candidate?.reminderAt?.toISOString()).toBe(reminderOpensAt(expiryDate, { kind: "documentPrompt", prompt: 90 }).toISOString());
  });

  it("matches a milestone's reminderAt", () => {
    const dueDate = at("2026-07-01");
    const candidate = getMilestoneNotificationCandidate(
      { id: "milestone-1", name: "Submit application", dueDate, goal: { id: "goal-1", name: "Move house" } },
      at("2026-06-01"),
      30,
    );

    expect(candidate?.reminderAt?.toISOString()).toBe(reminderOpensAt(dueDate, { kind: "leadDays", days: 30 }).toISOString());
  });

  it("matches an important date's reminderAt, measured from the occurrence", () => {
    const occurrence = at("2026-07-01");
    const candidate = getRelationshipDateNotificationCandidate(
      { id: "important-1", label: "Birthday", date: occurrence, repeatsYearly: true, personName: "Alice" },
      at("2026-06-01"),
      30,
    );

    expect(candidate?.reminderAt?.toISOString()).toBe(reminderOpensAt(occurrence, { kind: "leadDays", days: 30 }).toISOString());
  });

  it("matches a custom item's reminderAt", () => {
    const dueDate = at("2026-07-01");
    const candidate = getCustomItemNotificationCandidate(
      { id: "custom-1", name: "Service the car", dueDate, moduleId: "module-1" },
      at("2026-06-01"),
      30,
    );

    expect(candidate?.reminderAt?.toISOString()).toBe(reminderOpensAt(dueDate, { kind: "leadDays", days: 30 }).toISOString());
  });
});

describe("a pin's wording describes the deadline, never today", () => {
  it("names the record in the title", () => {
    expect(reminderPinTitle("Passport")).toBe("Passport reminder");
  });

  it("states the deadline as a date, so it stays true on a pin months out", () => {
    expect(reminderPinDetail("Passport", "expires", at("2026-07-01"), "en-AU")).toBe("Reminder for Passport · expires 1 July 2026");
  });

  it("reads the deadline in the person's own locale", () => {
    expect(reminderPinDetail("Passport", "expires", at("2026-07-01"), "en-US")).toBe("Reminder for Passport · expires Jul 1, 2026");
  });
});
