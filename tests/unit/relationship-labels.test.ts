import { describe, expect, it } from "vitest";
import { OBJECT_RELATIONSHIP_TYPES, relationshipIconKey, relationshipLabel } from "@/lib/objects/relationship-labels";
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

describe("relationshipIconKey: the per-type icon vocabulary the History peek's diff row keys off", () => {
  it("gives every canonical type its own forward/inverse icon key, mirroring relationshipLabel's own pairing", () => {
    expect(relationshipIconKey("SUPPORTS", false)).toBe("supports");
    expect(relationshipIconKey("SUPPORTS", true)).toBe("supported-by");
    expect(relationshipIconKey("BLOCKS", false)).toBe("blocks");
    expect(relationshipIconKey("BLOCKS", true)).toBe("blocked-by");
    expect(relationshipIconKey("DEPENDS_ON", false)).toBe("depends-on");
    expect(relationshipIconKey("DEPENDS_ON", true)).toBe("required-for");
  });

  it("gives a symmetric type the same icon key regardless of inverse", () => {
    expect(relationshipIconKey("RELATES_TO", false)).toBe("related-to");
    expect(relationshipIconKey("RELATES_TO", true)).toBe("related-to");
    expect(relationshipIconKey("ALONGSIDE", false)).toBe("alongside");
    expect(relationshipIconKey("ALONGSIDE", true)).toBe("alongside");
  });

  it("falls back to \"generic\" for CUSTOM (no fixed type to key an icon off) and for a missing type", () => {
    expect(relationshipIconKey("CUSTOM", false)).toBe("generic");
    expect(relationshipIconKey(null, false)).toBe("generic");
  });
});

describe("objectPairKey: a direction-independent identity for the two ends of a Kinesis Link", () => {
  it("uses the same pair key regardless of direction", () => {
    expect(objectPairKey("object-a", "object-b")).toBe(objectPairKey("object-b", "object-a"));
  });
});
