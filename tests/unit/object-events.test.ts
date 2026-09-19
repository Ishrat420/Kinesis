import { describe, expect, it } from "vitest";
import type { ObjectEvent } from "@prisma/client";
import { describeObjectEvent } from "@/lib/data/object-events";

/** A minimal, fully-shaped ObjectEvent row -- every test overrides only the fields its case cares about. */
function event(overrides: Partial<ObjectEvent>): ObjectEvent {
  return {
    id: "event-1",
    objectId: "object-1",
    userId: "user-1",
    eventType: "ITEM_CREATED",
    fieldKey: null,
    fieldLabel: null,
    oldValue: null,
    newValue: null,
    oldRelationshipType: null,
    newRelationshipType: null,
    inverse: null,
    relatedObjectId: null,
    relatedObjectName: null,
    source: "USER",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("describeObjectEvent: the single line a History entry renders", () => {
  it("renders RELATIONSHIP_ADDED with the forward label from the source side", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: false, relatedObjectName: "Save $30k" }));
    expect(line).toBe("Depends on → Save $30k");
  });

  it("renders the same RELATIONSHIP_ADDED with the inverse label from the target side", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: true, relatedObjectName: "Mortgage pre-approval" }));
    expect(line).toBe("Required for → Mortgage pre-approval");
  });

  it("renders a CUSTOM RELATIONSHIP_ADDED with its literal text, identically regardless of inverse", () => {
    const forward = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "CUSTOM", newValue: "Renewal document", inverse: false, relatedObjectName: "Passport" }));
    const inverse = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "CUSTOM", newValue: "Renewal document", inverse: true, relatedObjectName: "Passport" }));
    expect(forward).toBe("Renewal document → Passport");
    expect(inverse).toBe("Renewal document → Passport");
  });

  it("renders RELATIONSHIP_REMOVED with the old label, prefixed to distinguish it from an active link", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: "BLOCKS", inverse: false, relatedObjectName: "Submit application" }));
    expect(line).toBe("No longer linked: Blocks → Submit application");
  });

  it("renders RELATIONSHIP_CHANGED with old and new labels, each resolved from this row's own side", () => {
    const onSource = describeObjectEvent(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS", inverse: false, relatedObjectName: "Buy a house" }));
    const onTarget = describeObjectEvent(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS", inverse: true, relatedObjectName: "Mortgage pre-approval" }));
    expect(onSource).toBe("Supports → Blocks (Buy a house)");
    expect(onTarget).toBe("Supported by → Blocked by (Mortgage pre-approval)");
  });

  it("renders ITEM_DELETED naming the deleted record", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_DELETED", relatedObjectName: "Old goal" }))).toBe("Old goal was deleted");
  });

  it("falls back gracefully when the related object's own name is gone too", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_DELETED", relatedObjectName: null }))).toBe("a deleted record was deleted");
  });

  it("renders ITEM_CREATED as a plain, fixed line", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_CREATED" }))).toBe("Created");
  });

  it("falls back to the field label for an event type without its own rendering yet", () => {
    expect(describeObjectEvent(event({ eventType: "STATUS_CHANGED", fieldLabel: "Status" }))).toBe("Status changed");
    expect(describeObjectEvent(event({ eventType: "STATUS_CHANGED", fieldLabel: null }))).toBe("Updated");
  });
});
