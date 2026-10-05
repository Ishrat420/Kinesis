import { describe, expect, it } from "vitest";
import { contentFingerprint, discardContentChanges, emptySelfRelationship, type RelationshipMapData, type RelationshipPerson } from "@/lib/relationships";

const person = (id: string, name: string, x = 0, y = 0): RelationshipPerson => ({ id, name, detail: "Friend", x, y, size: 84, color: "#000", icon: "user", selfRelationship: emptySelfRelationship(), objectId: null });

describe("discardContentChanges", () => {
  const saved: RelationshipMapData = { people: [person("me", "Me"), person("sam", "Sam")], relationships: [] };

  it("puts back what was last saved", () => {
    const current: RelationshipMapData = {
      people: [person("me", "Me"), person("sam", "Samantha"), person("new", "New person")],
      relationships: [{ id: "r1", from: "me", to: "new", type: null, practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "", createdAt: "2030-01-01" }],
    };
    const restored = discardContentChanges(saved, current);
    expect(contentFingerprint(restored)).toBe(contentFingerprint(saved));
    expect(restored.people.map((p) => p.name)).toEqual(["Me", "Sam"]);
    expect(restored.relationships).toEqual([]);
  });

  it("keeps where bubbles were dragged, since positions save on their own", () => {
    const current: RelationshipMapData = { people: [person("me", "Me", 10, 20), person("sam", "Changed", 300, 400)], relationships: [] };
    const restored = discardContentChanges(saved, current);
    expect(restored.people.find((p) => p.id === "sam")).toMatchObject({ name: "Sam", x: 300, y: 400 });
    expect(restored.people.find((p) => p.id === "me")).toMatchObject({ x: 10, y: 20 });
  });

  it("brings back someone deleted since the save, where they last were", () => {
    const restored = discardContentChanges(saved, { people: [person("me", "Me")], relationships: [] });
    expect(restored.people.map((p) => p.id)).toEqual(["me", "sam"]);
  });
});
