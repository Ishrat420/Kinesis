import { describe, expect, it } from "vitest";
import { OBJECT_RELATIONSHIP_TYPES, relationshipLabel } from "@/lib/objects/relationship-labels";
import { objectPairKey } from "@/lib/objects/relationships";

describe("relationshipLabel: the canonical forward/inverse vocabulary shared by every typed Kinesis Link", () => {
  it("provides the curated forward and inverse vocabulary", () => {
    expect(OBJECT_RELATIONSHIP_TYPES).toEqual(["SUPPORTS", "BLOCKS", "DEPENDS_ON", "RELATES_TO", "ALONGSIDE"]);
    expect(relationshipLabel("SUPPORTS")).toBe("Supports");
    expect(relationshipLabel("SUPPORTS", true)).toBe("Supported by");
    expect(relationshipLabel("BLOCKS", true)).toBe("Blocked by");
    expect(relationshipLabel("DEPENDS_ON", true)).toBe("Required for");
    expect(relationshipLabel("RELATES_TO", true)).toBe("Related to");
    expect(relationshipLabel("ALONGSIDE", true)).toBe("Alongside");
  });
});

describe("objectPairKey: a direction-independent identity for the two ends of a Kinesis Link", () => {
  it("uses the same pair key regardless of direction", () => {
    expect(objectPairKey("object-a", "object-b")).toBe(objectPairKey("object-b", "object-a"));
  });
});
