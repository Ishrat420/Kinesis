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

  it("renders STATUS_CHANGED with the old and new status text", () => {
    expect(describeObjectEvent(event({ eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Revisit Later" }))).toBe("Status: Active → Revisit Later");
  });

  it("renders ITEM_ARCHIVED and ITEM_RESTORED as plain, fixed lines", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_ARCHIVED" }))).toBe("Archived");
    expect(describeObjectEvent(event({ eventType: "ITEM_RESTORED" }))).toBe("Restored");
  });

  it("renders GOAL_COMPLETED as a plain, fixed line", () => {
    expect(describeObjectEvent(event({ eventType: "GOAL_COMPLETED" }))).toBe("Goal completed");
  });

  it("renders GOAL_MILESTONE_COMPLETED naming the milestone when its name was recorded, generically otherwise", () => {
    expect(describeObjectEvent(event({ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Deposit saved" }))).toBe('Milestone "Deposit saved" completed');
    expect(describeObjectEvent(event({ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: null }))).toBe("Milestone completed");
  });

  it("renders TODO_COMPLETED and TODO_REOPENED as plain, fixed lines", () => {
    expect(describeObjectEvent(event({ eventType: "TODO_COMPLETED" }))).toBe("Completed");
    expect(describeObjectEvent(event({ eventType: "TODO_REOPENED" }))).toBe("Reopened");
  });

  describe("FIELD_CHANGED", () => {
    it("reads as a plain before/after when the field already had a value", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Notes", oldValue: "Old note", newValue: "New note" }))).toBe("Notes: Old note → New note");
    });

    it("reads as \"set to\" when the field had no prior value", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Country", oldValue: null, newValue: "Australia" }))).toBe("Country set to Australia");
    });

    it("reads as \"removed\" when the field's value went away", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Country", oldValue: "Australia", newValue: null }))).toBe("Country removed (was Australia)");
    });

    it("falls back to a generic label when somehow missing its own fieldLabel", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: null, oldValue: "1", newValue: "2" }))).toBe("A field: 1 → 2");
    });
  });

  it("falls back to a generic line for a type the renderer doesn't otherwise recognise", () => {
    // Every real ObjectEventType is handled above; this exercises the
    // defensive default branch itself, in case a future enum value is ever
    // added to the schema before this renderer is taught about it.
    const unrecognised = "SOMETHING_NEW" as unknown as ObjectEvent["eventType"];
    expect(describeObjectEvent(event({ eventType: unrecognised, fieldLabel: "Mystery" }))).toBe("Mystery changed");
    expect(describeObjectEvent(event({ eventType: unrecognised, fieldLabel: null }))).toBe("Updated");
  });
});
