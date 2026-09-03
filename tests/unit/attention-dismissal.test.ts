import { describe, expect, it } from "vitest";
import { dismissalKey, isDismissibleKind, parseDismissalKey } from "@/lib/attention/dismissal";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("which Needs Attention rows offer a Dismiss button", () => {
  it("accepts the three kinds the card renders one for", () => {
    expect(isDismissibleKind("document")).toBe(true);
    expect(isDismissibleKind("custom")).toBe(true);
    expect(isDismissibleKind("todo")).toBe(true);
  });

  it("rejects a milestone, which resolves or reschedules instead of hiding", () => {
    // KD-017 replaced the milestone's Dismiss button with "Mark complete" and
    // "Reschedule". The server used to keep accepting milestone keys nothing
    // could send; the two sides now agree.
    expect(isDismissibleKind("milestone")).toBe(false);
    expect(parseDismissalKey(dismissalKey("milestone", "milestone-1", at("2026-06-01")))).toBeNull();
  });

  it("rejects a kind nobody defined", () => {
    expect(isDismissibleKind("goal")).toBe(false);
    expect(parseDismissalKey("goal:goal-1:2026-06-01")).toBeNull();
  });
});

describe("dismissalKey: a dismissal names a deadline, not just a record", () => {
  it("carries the date alongside the record", () => {
    expect(dismissalKey("document", "document-1", at("2026-06-01")))
      .toBe("document:document-1:2026-06-01");
  });

  it("produces a different key for every different date, which is the whole mechanism", () => {
    expect(dismissalKey("custom", "item-1", at("2026-06-01")))
      .not.toBe(dismissalKey("custom", "item-1", at("2026-06-02")));
  });

  it("produces the same key for an unchanged date, so a dismissal keeps holding", () => {
    expect(dismissalKey("todo", "todo-1", at("2026-06-01")))
      .toBe(dismissalKey("todo", "todo-1", new Date("2026-06-01T00:00:00.000Z")));
  });

  it("reads the day in UTC so a key never shifts with the reader's time zone", () => {
    // A calendar date is stored at UTC midnight; formatting it locally east of
    // UTC would spell yesterday and silently revive every dismissal.
    expect(dismissalKey("document", "document-1", new Date("2026-06-01T00:00:00.000Z")))
      .toBe("document:document-1:2026-06-01");
  });
});

describe("parseDismissalKey: reading a key back", () => {
  it("round-trips a key it built", () => {
    expect(parseDismissalKey(dismissalKey("document", "document-1", at("2026-06-01"))))
      .toEqual({ kind: "document", id: "document-1", date: "2026-06-01" });
  });

  it("rejects a legacy key with no date, so an old dismissal cannot hide anything", () => {
    expect(parseDismissalKey("document:document-1")).toBeNull();
    expect(parseDismissalKey("custom:item-1")).toBeNull();
    expect(parseDismissalKey("todo:todo-1")).toBeNull();
  });

  it("rejects a malformed date rather than trusting it", () => {
    expect(parseDismissalKey("document:document-1:01/06/2026")).toBeNull();
    expect(parseDismissalKey("document:document-1:2026-6-1")).toBeNull();
    expect(parseDismissalKey("document:document-1:")).toBeNull();
  });

  it("rejects anything shaped like a key but carrying nothing to identify", () => {
    expect(parseDismissalKey("document::2026-06-01")).toBeNull();
    expect(parseDismissalKey("")).toBeNull();
  });
});
