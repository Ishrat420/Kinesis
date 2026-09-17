import { describe, expect, it } from "vitest";
import { notificationKey, notificationRecordLink, NOTIFICATION_LINK_FIELD, NOTIFICATION_SOURCES } from "@/lib/notifications/identity";

/**
 * notificationKey and notificationRecordLink underpin every notification and
 * dismissal in the app -- what makes two notifications "the same" one to
 * have read, and which column links a NotificationRead/NotificationFirstSeen
 * row back to its record -- yet neither had a single direct test. Everything
 * downstream (collectNotifications, markNotificationRead, dismissalKey) only
 * ever exercised them indirectly, through a whole notification's worth of
 * setup, which would let a change to the key's own format slip through
 * without any test naming the actual regression.
 */

describe("notificationKey", () => {
  it("joins source, id, type and the deadline as a plain yyyy-mm-dd", () => {
    expect(notificationKey("document", "doc-1", "EXPIRED", new Date("2026-03-01T00:00:00.000Z"))).toBe("document:doc-1:EXPIRED:2026-03-01");
  });

  it("is stable across two calls with the exact same inputs", () => {
    const deadline = new Date("2026-06-15T00:00:00.000Z");
    expect(notificationKey("milestone", "m-1", "MILESTONE_DUE", deadline)).toBe(notificationKey("milestone", "m-1", "MILESTONE_DUE", deadline));
  });

  /** Moving a deadline makes a new notification -- the old key stops matching, so it returns unread. */
  it("changes when the deadline moves, even with everything else identical", () => {
    const first = notificationKey("todo", "t-1", "TODO_DUE", new Date("2026-06-01T00:00:00.000Z"));
    const second = notificationKey("todo", "t-1", "TODO_DUE", new Date("2026-06-02T00:00:00.000Z"));
    expect(first).not.toBe(second);
  });

  /** A reminder and the overdue notice that replaces it are separate things to have read. */
  it("changes when the type changes, even for the same record and deadline", () => {
    const deadline = new Date("2026-06-01T00:00:00.000Z");
    const reminder = notificationKey("custom", "c-1", "REMINDER_DUE", deadline);
    const due = notificationKey("custom", "c-1", "CUSTOM_ITEM_DUE", deadline);
    expect(reminder).not.toBe(due);
  });

  it("changes when the record id changes, even for the same source, type and deadline", () => {
    const deadline = new Date("2026-06-01T00:00:00.000Z");
    expect(notificationKey("todo", "t-1", "TODO_DUE", deadline)).not.toBe(notificationKey("todo", "t-2", "TODO_DUE", deadline));
  });

  it("changes when the source changes, even for coincidentally identical id/type/deadline", () => {
    const deadline = new Date("2026-06-01T00:00:00.000Z");
    expect(notificationKey("todo", "x-1", "TODO_DUE", deadline)).not.toBe(notificationKey("custom", "x-1", "TODO_DUE", deadline));
  });

  it("drops the time of day, so two instants on the same calendar day collide", () => {
    const morning = notificationKey("document", "doc-1", "EXPIRED", new Date("2026-03-01T02:00:00.000Z"));
    const evening = notificationKey("document", "doc-1", "EXPIRED", new Date("2026-03-01T23:00:00.000Z"));
    expect(morning).toBe(evening);
  });
});

describe("notificationRecordLink", () => {
  it("maps every notification source to the correct foreign-key column", () => {
    expect(notificationRecordLink("document", "doc-1")).toEqual({ documentId: "doc-1" });
    expect(notificationRecordLink("milestone", "m-1")).toEqual({ milestoneId: "m-1" });
    expect(notificationRecordLink("relationship", "r-1")).toEqual({ relationshipDateId: "r-1" });
    expect(notificationRecordLink("custom", "c-1")).toEqual({ customItemId: "c-1" });
    expect(notificationRecordLink("todo", "t-1")).toEqual({ todoId: "t-1" });
  });

  it("produces exactly one key -- never a stray extra field", () => {
    for (const source of NOTIFICATION_SOURCES) {
      expect(Object.keys(notificationRecordLink(source, "id-1"))).toEqual([NOTIFICATION_LINK_FIELD[source]]);
    }
  });
});
