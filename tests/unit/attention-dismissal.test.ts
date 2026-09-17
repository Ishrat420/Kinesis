import { describe, expect, it } from "vitest";
import { dismissalKey, isDismissibleKind, parseDismissalKey } from "@/lib/attention/dismissal";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("which rows offer a Dismiss button", () => {
  it("accepts the two kinds Needs Attention renders one for, plus Upcoming & Due's relationship dates (KD-047)", () => {
    expect(isDismissibleKind("document")).toBe(true);
    expect(isDismissibleKind("custom")).toBe(true);
    expect(isDismissibleKind("relationship")).toBe(true);
  });

  it("rejects a milestone, which resolves or reschedules instead of hiding", () => {
    // KD-017 replaced the milestone's Dismiss button with "Mark complete" and
    // "Reschedule". The server used to keep accepting milestone keys nothing
    // could send; the two sides now agree.
    expect(isDismissibleKind("milestone")).toBe(false);
    expect(parseDismissalKey(dismissalKey("milestone", "milestone-1", "MILESTONE_DUE", at("2026-06-01")))).toBeNull();
  });

  it("rejects a to-do, for the same reason -- it also gets Mark complete and Reschedule now", () => {
    expect(isDismissibleKind("todo")).toBe(false);
    expect(parseDismissalKey(dismissalKey("todo", "todo-1", "TODO_DUE", at("2026-06-01")))).toBeNull();
  });

  it("rejects a kind nobody defined", () => {
    expect(isDismissibleKind("goal")).toBe(false);
    expect(parseDismissalKey("goal:goal-1:EXPIRED:2026-06-01")).toBeNull();
  });
});

describe("dismissalKey: a dismissal names a notice about a deadline, not just a record", () => {
  it("carries the type and date alongside the record", () => {
    expect(dismissalKey("document", "document-1", "EXPIRED", at("2026-06-01")))
      .toBe("document:document-1:EXPIRED:2026-06-01");
  });

  it("produces a different key for every different date, which is part of the mechanism", () => {
    expect(dismissalKey("custom", "item-1", "CUSTOM_ITEM_DUE", at("2026-06-01")))
      .not.toBe(dismissalKey("custom", "item-1", "CUSTOM_ITEM_DUE", at("2026-06-02")));
  });

  it("produces the same key for an unchanged type and date, so a dismissal keeps holding", () => {
    expect(dismissalKey("custom", "item-1", "CUSTOM_ITEM_DUE", at("2026-06-01")))
      .toBe(dismissalKey("custom", "item-1", "CUSTOM_ITEM_DUE", new Date("2026-06-01T00:00:00.000Z")));
  });

  it("reads the day in UTC so a key never shifts with the reader's time zone", () => {
    // A calendar date is stored at UTC midnight; formatting it locally east of
    // UTC would spell yesterday and silently revive every dismissal.
    expect(dismissalKey("document", "document-1", "EXPIRED", new Date("2026-06-01T00:00:00.000Z")))
      .toBe("document:document-1:EXPIRED:2026-06-01");
  });

  /**
   * The bug the type half of this key exists to prevent: Upcoming & Due
   * offers Dismiss on both a record's advance notice ("expiring soon" / "due
   * soon") and the overdue notice that later replaces it, at the very same
   * deadline. Without the type in the key, dismissing the advance notice
   * would silently dismiss the overdue one too, the moment it arrived --
   * reaching the deadline must surface it fresh instead.
   */
  it("produces a different key for the advance notice than for the overdue one, at the very same deadline", () => {
    expect(dismissalKey("document", "document-1", "REMINDER_DUE", at("2026-06-01")))
      .not.toBe(dismissalKey("document", "document-1", "EXPIRED", at("2026-06-01")));
    expect(dismissalKey("custom", "item-1", "REMINDER_DUE", at("2026-06-01")))
      .not.toBe(dismissalKey("custom", "item-1", "CUSTOM_ITEM_DUE", at("2026-06-01")));
  });
});

describe("parseDismissalKey: reading a key back", () => {
  it("round-trips a key it built", () => {
    expect(parseDismissalKey(dismissalKey("document", "document-1", "EXPIRED", at("2026-06-01"))))
      .toEqual({ kind: "document", id: "document-1", type: "EXPIRED", date: "2026-06-01" });
  });

  it("accepts either notice a dismissible kind can actually carry", () => {
    expect(parseDismissalKey("document:document-1:REMINDER_DUE:2026-06-01")).toEqual({ kind: "document", id: "document-1", type: "REMINDER_DUE", date: "2026-06-01" });
    expect(parseDismissalKey("document:document-1:EXPIRED:2026-06-01")).toEqual({ kind: "document", id: "document-1", type: "EXPIRED", date: "2026-06-01" });
    expect(parseDismissalKey("custom:item-1:REMINDER_DUE:2026-06-01")).toEqual({ kind: "custom", id: "item-1", type: "REMINDER_DUE", date: "2026-06-01" });
    expect(parseDismissalKey("custom:item-1:CUSTOM_ITEM_DUE:2026-06-01")).toEqual({ kind: "custom", id: "item-1", type: "CUSTOM_ITEM_DUE", date: "2026-06-01" });
    expect(parseDismissalKey("relationship:date-1:REMINDER_DUE:2026-06-01")).toEqual({ kind: "relationship", id: "date-1", type: "REMINDER_DUE", date: "2026-06-01" });
  });

  it("rejects a type that does not belong to the kind, even if it is a real notification type", () => {
    // MILESTONE_DUE and CUSTOM_ITEM_DUE are both real, but neither means
    // anything for a document -- and EXPIRED means nothing for a custom item
    // or a relationship date, which is never overdue (ADR-010). Each
    // dismissible kind is limited to the notices it can actually carry.
    expect(parseDismissalKey("document:document-1:MILESTONE_DUE:2026-06-01")).toBeNull();
    expect(parseDismissalKey("document:document-1:CUSTOM_ITEM_DUE:2026-06-01")).toBeNull();
    expect(parseDismissalKey("custom:item-1:EXPIRED:2026-06-01")).toBeNull();
    expect(parseDismissalKey("relationship:date-1:EXPIRED:2026-06-01")).toBeNull();
  });

  it("rejects a legacy key carrying no type at all, so an old dismissal cannot hide anything", () => {
    expect(parseDismissalKey("document:document-1")).toBeNull();
    expect(parseDismissalKey("custom:item-1")).toBeNull();
    expect(parseDismissalKey("todo:todo-1")).toBeNull();
    expect(parseDismissalKey("document:document-1:2026-06-01")).toBeNull();
  });

  it("rejects a malformed date rather than trusting it", () => {
    expect(parseDismissalKey("document:document-1:EXPIRED:01/06/2026")).toBeNull();
    expect(parseDismissalKey("document:document-1:EXPIRED:2026-6-1")).toBeNull();
    expect(parseDismissalKey("document:document-1:EXPIRED:")).toBeNull();
  });

  it("rejects anything shaped like a key but carrying nothing to identify", () => {
    expect(parseDismissalKey("document::EXPIRED:2026-06-01")).toBeNull();
    expect(parseDismissalKey("")).toBeNull();
  });
});
