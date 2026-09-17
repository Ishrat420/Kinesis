import { describe, expect, it, vi } from "vitest";
import { toDerivedNotification } from "@/lib/notifications/engine";

/**
 * toDerivedNotification is the one place a raw candidate becomes the shape
 * every reader (the bell, the mark-read actions) actually works with -- it
 * builds the notification's key, attaches who it's about, and looks up
 * whether it's been read. collectNotifications is its only real caller and
 * exercises it constantly, but always as one step inside a whole derivation
 * pass; nothing pinned this function's own contract directly, so a change to
 * how it builds the key or reads readAt could break silently as long as
 * collectNotifications' broader assertions still happened to pass.
 */

const candidate = {
  type: "REMINDER_DUE" as const,
  reminderAt: new Date("2026-06-01T00:00:00.000Z"),
  timeUntilExpiry: "5 days",
  expiryDate: new Date("2026-06-10T00:00:00.000Z"),
  documentName: "Passport",
  documentType: "Passport",
  message: "Passport expires in 5 days",
  actionUrl: "/documents/doc-1",
};

describe("toDerivedNotification", () => {
  it("returns null when there is no candidate, without calling the readAt lookup", () => {
    const readAtFor = vi.fn();
    expect(toDerivedNotification("document", "doc-1", null, readAtFor)).toBeNull();
    expect(readAtFor).not.toHaveBeenCalled();
  });

  it("builds its key the same way notificationKey does, from the source/id/candidate type/deadline", () => {
    const result = toDerivedNotification("document", "doc-1", candidate, () => null);
    expect(result?.key).toBe("document:doc-1:REMINDER_DUE:2026-06-10");
  });

  it("carries the source and sourceId through unchanged", () => {
    const result = toDerivedNotification("todo", "todo-1", candidate, () => null);
    expect(result).toMatchObject({ source: "todo", sourceId: "todo-1" });
  });

  it("looks readAt up by the exact key it just built, not by the record id", () => {
    const readAtFor = vi.fn((key: string) => key === "document:doc-1:REMINDER_DUE:2026-06-10" ? new Date("2026-06-05T00:00:00.000Z") : null);
    const result = toDerivedNotification("document", "doc-1", candidate, readAtFor);

    expect(readAtFor).toHaveBeenCalledWith("document:doc-1:REMINDER_DUE:2026-06-10");
    expect(result?.readAt).toEqual(new Date("2026-06-05T00:00:00.000Z"));
  });

  it("reports unread as null when the lookup finds nothing", () => {
    const result = toDerivedNotification("document", "doc-1", candidate, () => null);
    expect(result?.readAt).toBeNull();
  });

  it("spreads every field of the candidate itself onto the result", () => {
    const result = toDerivedNotification("document", "doc-1", candidate, () => null);
    expect(result).toMatchObject(candidate);
  });

  it("defaults moduleIcon/moduleColor to null when no module is given", () => {
    const result = toDerivedNotification("todo", "todo-1", candidate, () => null);
    expect(result).toMatchObject({ moduleIcon: null, moduleColor: null });
  });

  it("carries a custom item's module icon and color through when given", () => {
    const result = toDerivedNotification("custom", "item-1", candidate, () => null, { icon: "star", color: "#111111" });
    expect(result).toMatchObject({ moduleIcon: "star", moduleColor: "#111111" });
  });

  it("does not attach firstSeenAt -- that's collectNotifications' job, not this function's", () => {
    const result = toDerivedNotification("document", "doc-1", candidate, () => null);
    expect(result).not.toHaveProperty("firstSeenAt");
  });
});
