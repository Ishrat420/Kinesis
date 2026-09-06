import { describe, expect, it } from "vitest";
import {
  contentFingerprint,
  mapGeometry,
  validateGeometry,
  validateRelationshipMap,
  type RelationshipMapData,
  type RelationshipPerson,
} from "@/lib/relationships";

const person = (id: string, overrides: Partial<RelationshipPerson> = {}): RelationshipPerson => ({
  id, name: id, detail: "Friend", x: 10, y: 20, size: 84, color: "#292524", icon: "user",
  selfRelationship: { practices: [], reflections: [], importantDates: [], notes: "" },
  ...overrides,
});

const map = (overrides: Partial<RelationshipMapData> = {}): RelationshipMapData => ({
  people: [person("one"), person("two")],
  relationships: [{
    id: "link", from: "one", to: "two", type: "Friend",
    practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "",
  }],
  ...overrides,
});

describe("validateRelationshipMap", () => {
  it("accepts a map the editor can actually produce", () => {
    expect(validateRelationshipMap(map())).toBeNull();
  });

  it("rejects a connection pointing at someone who is not on the map", () => {
    expect(validateRelationshipMap(map({ people: [person("one")] })))
      .toBe("A connection points at someone who is not on the map.");
  });

  /**
   * The database holds a pair in the order it was written, so a reversed
   * duplicate would pass an order-sensitive check and then fail on the unique
   * constraint half way through the transaction.
   */
  it("rejects the same pair connected twice in either direction", () => {
    expect(validateRelationshipMap(map({
      relationships: [
        { id: "a", from: "one", to: "two", type: null, practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
        { id: "b", from: "two", to: "one", type: null, practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
      ],
    }))).toBe("Two of these people are connected twice.");
  });

  it("rejects a practice whose start date is not a real date", () => {
    expect(validateRelationshipMap(map({
      people: [person("one", { selfRelationship: { notes: "", reflections: [], importantDates: [], practices: [{ id: "p", title: "Walk", cadence: "Weekly", anchorDate: "2026-02-30" }] } }), person("two")],
    }))).toBe("one has a connection practice with an invalid start date.");
  });

  it.each([
    ["an unnamed person", map({ people: [person("one", { name: "  " }), person("two")] }), "Every person needs a name."],
    ["an off-map position", map({ people: [person("one", { x: 10 ** 9 }), person("two")] }), "one is positioned off the map."],
    ["an impossible bubble size", map({ people: [person("one", { size: 4000 }), person("two")] }), "one's bubble is an impossible size."],
    ["a duplicated person", map({ people: [person("one"), person("one")] }), "The same person appears on the map twice."],
  ])("rejects %s", (_label, payload, message) => {
    expect(validateRelationshipMap(payload)).toBe(message);
  });
});

describe("validateGeometry", () => {
  it("accepts what a drag produces", () => {
    expect(validateGeometry(mapGeometry(map().people))).toBeNull();
  });

  it("rejects a bubble dragged off the map", () => {
    expect(validateGeometry([{ id: "one", x: Number.POSITIVE_INFINITY, y: 0, size: 84 }]))
      .toBe("A bubble was moved off the map.");
  });
});

describe("contentFingerprint", () => {
  /** Geometry autosaves on its own, so moving a bubble must not look unsaved. */
  it("ignores where a bubble sits and how big it is", () => {
    expect(contentFingerprint(map({ people: [person("one", { x: 500, y: 900, size: 140 }), person("two")] })))
      .toBe(contentFingerprint(map()));
  });

  it("notices an edit to anything else", () => {
    expect(contentFingerprint(map({ people: [person("one", { name: "Renamed" }), person("two")] })))
      .not.toBe(contentFingerprint(map()));
  });

  it("notices a practice changing its schedule", () => {
    const withPractice = (anchorDate: string) => map({
      people: [person("one", { selfRelationship: { notes: "", reflections: [], importantDates: [], practices: [{ id: "p", title: "Walk", cadence: "Weekly", anchorDate }] } }), person("two")],
    });
    expect(contentFingerprint(withPractice("2026-01-04"))).not.toBe(contentFingerprint(withPractice("2026-01-07")));
  });

  /** Values that would run together if the fields were simply concatenated. */
  it("does not confuse two records whose fields join to the same text", () => {
    expect(contentFingerprint(map({ people: [person("one", { name: "ab", detail: "c" }), person("two")] })))
      .not.toBe(contentFingerprint(map({ people: [person("one", { name: "a", detail: "bc" }), person("two")] })));
  });
});
