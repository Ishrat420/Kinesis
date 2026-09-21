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
    oldInverse: null,
    relatedObjectId: null,
    relatedObjectName: null,
    source: "USER",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("describeObjectEvent: the title/detail pair a History entry renders", () => {
  it("renders RELATIONSHIP_ADDED with the forward label from the source side", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: false, relatedObjectName: "Save $30k" }));
    expect(line).toEqual({ title: "Linked", detail: "Depends on · Save $30k" });
  });

  it("renders the same RELATIONSHIP_ADDED with the inverse label from the target side", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON", inverse: true, relatedObjectName: "Mortgage pre-approval" }));
    expect(line).toEqual({ title: "Linked", detail: "Required for · Mortgage pre-approval" });
  });

  it("renders a CUSTOM RELATIONSHIP_ADDED with its literal text, identically regardless of inverse", () => {
    const forward = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "CUSTOM", newValue: "Renewal document", inverse: false, relatedObjectName: "Passport" }));
    const inverse = describeObjectEvent(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "CUSTOM", newValue: "Renewal document", inverse: true, relatedObjectName: "Passport" }));
    expect(forward).toEqual({ title: "Linked", detail: "Renewal document · Passport" });
    expect(inverse).toEqual({ title: "Linked", detail: "Renewal document · Passport" });
  });

  it("renders RELATIONSHIP_REMOVED with the old label, its own title distinguishing it from an active link", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: "BLOCKS", inverse: false, relatedObjectName: "Submit application" }));
    expect(line).toEqual({ title: "No longer linked", detail: "Blocks · Submit application" });
  });

  it("renders RELATIONSHIP_CHANGED with old and new labels, each resolved from this row's own side", () => {
    const onSource = describeObjectEvent(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS", inverse: false, relatedObjectName: "Buy a house" }));
    const onTarget = describeObjectEvent(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS", inverse: true, relatedObjectName: "Mortgage pre-approval" }));
    expect(onSource).toEqual({ title: "Relationship changed", detail: "From Supports · To Blocks (Buy a house)" });
    expect(onTarget).toEqual({ title: "Relationship changed", detail: "From Supported by · To Blocked by (Mortgage pre-approval)" });
  });

  it("falls back to `inverse` for a RELATIONSHIP_CHANGED row with no `oldInverse` recorded (pre-migration data)", () => {
    const line = describeObjectEvent(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS", inverse: false, oldInverse: null, relatedObjectName: "Buy a house" }));
    expect(line).toEqual({ title: "Relationship changed", detail: "From Supports · To Blocks (Buy a house)" });
  });

  it("renders RELATIONSHIP_CHANGED's 'From' side from its own pre-retype orientation when a retype flips which endpoint is forward", () => {
    // A retype from a forward-facing type to an inverse-facing one (or back)
    // flips ObjectRelationship's stored source/target -- so this endpoint's
    // pre-retype side (oldInverse: true, the old link's target) can differ
    // from its post-retype side (inverse: false, the new link's source).
    // Using `inverse` for both, as before this fix, would have rendered the
    // "From" side as "Supports" instead of the actually-true "Supported by".
    const line = describeObjectEvent(event({
      eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "SUPPORTS", newRelationshipType: "BLOCKS",
      oldInverse: true, inverse: false, relatedObjectName: "Buy a house",
    }));
    expect(line).toEqual({ title: "Relationship changed", detail: "From Supported by · To Blocks (Buy a house)" });
  });

  it("renders ITEM_DELETED naming the deleted record in its title, with no detail line", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_DELETED", relatedObjectName: "Old goal" }))).toEqual({ title: "Old goal was deleted", detail: null });
  });

  it("falls back gracefully when the related object's own name is gone too", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_DELETED", relatedObjectName: null }))).toEqual({ title: "a deleted record was deleted", detail: null });
  });

  it("renders ITEM_CREATED as a plain, fixed title with no detail line", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_CREATED" }))).toEqual({ title: "Created", detail: null });
  });

  it("renders STATUS_CHANGED with a from/to detail line", () => {
    expect(describeObjectEvent(event({ eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Revisit Later" }))).toEqual({ title: "Status changed", detail: "From Active · To Revisit Later" });
  });

  it("renders ITEM_ARCHIVED and ITEM_RESTORED as plain, fixed titles", () => {
    expect(describeObjectEvent(event({ eventType: "ITEM_ARCHIVED" }))).toEqual({ title: "Archived", detail: null });
    expect(describeObjectEvent(event({ eventType: "ITEM_RESTORED" }))).toEqual({ title: "Restored", detail: null });
  });

  it("renders GOAL_COMPLETED as a plain, fixed title", () => {
    expect(describeObjectEvent(event({ eventType: "GOAL_COMPLETED" }))).toEqual({ title: "Goal completed", detail: null });
  });

  it("renders GOAL_MILESTONE_COMPLETED naming the milestone when its name was recorded, generically otherwise", () => {
    expect(describeObjectEvent(event({ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Deposit saved" }))).toEqual({ title: 'Milestone "Deposit saved" completed', detail: null });
    expect(describeObjectEvent(event({ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: null }))).toEqual({ title: "Milestone completed", detail: null });
  });

  it("renders TODO_COMPLETED and TODO_REOPENED as plain, fixed titles", () => {
    expect(describeObjectEvent(event({ eventType: "TODO_COMPLETED" }))).toEqual({ title: "Completed", detail: null });
    expect(describeObjectEvent(event({ eventType: "TODO_REOPENED" }))).toEqual({ title: "Reopened", detail: null });
  });

  describe("FIELD_CHANGED", () => {
    it("reads as a plain before/after when the field already had a value", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Notes", oldValue: "Old note", newValue: "New note" }))).toEqual({ title: "Notes changed", detail: "From Old note · To New note" });
    });

    it("reads as \"set\" when the field had no prior value", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Country", oldValue: null, newValue: "Australia" }))).toEqual({ title: "Country set", detail: "To Australia" });
    });

    it("reads as \"removed\" when the field's value went away", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: "Country", oldValue: "Australia", newValue: null }))).toEqual({ title: "Country removed", detail: "Was Australia" });
    });

    it("falls back to a generic label when somehow missing its own fieldLabel", () => {
      expect(describeObjectEvent(event({ eventType: "FIELD_CHANGED", fieldLabel: null, oldValue: "1", newValue: "2" }))).toEqual({ title: "A field changed", detail: "From 1 · To 2" });
    });
  });

  it("falls back to a generic line for a type the renderer doesn't otherwise recognise", () => {
    // Every real ObjectEventType is handled above; this exercises the
    // defensive default branch itself, in case a future enum value is ever
    // added to the schema before this renderer is taught about it.
    const unrecognised = "SOMETHING_NEW" as unknown as ObjectEvent["eventType"];
    expect(describeObjectEvent(event({ eventType: unrecognised, fieldLabel: "Mystery" }))).toEqual({ title: "Mystery changed", detail: null });
    expect(describeObjectEvent(event({ eventType: unrecognised, fieldLabel: null }))).toEqual({ title: "Updated", detail: null });
  });
});
