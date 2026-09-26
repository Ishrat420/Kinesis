import { describe, expect, it } from "vitest";
import { calculatePercentChange, classifyEventSignificance, type ClassifiableEvent } from "@/lib/data/object-events";

/** A minimal, fully-shaped classifiable event -- every test overrides only the fields its case cares about. */
function event(overrides: Partial<ClassifiableEvent>): ClassifiableEvent {
  return {
    eventType: "ITEM_CREATED",
    fieldKey: null,
    oldValue: null,
    newValue: null,
    oldRelationshipType: null,
    newRelationshipType: null,
    objectType: "DOCUMENT",
    ...overrides,
  };
}

describe("classifyEventSignificance: KD-052 Phase 4's base significance table", () => {
  describe("item creation and dataless moments", () => {
    it("ITEM_CREATED is LOW for a standalone record, regardless of module", () => {
      for (const objectType of ["DOCUMENT", "GOAL", "TODO", "PERSON", "CUSTOM_ITEM", "FINANCE_ITEM"] as const) {
        expect(classifyEventSignificance(event({ eventType: "ITEM_CREATED", objectType }))).toBe("low");
      }
    });

    it("ITEM_DELETED gets the ticket's own NORMAL interim default -- not addressed by any table", () => {
      expect(classifyEventSignificance(event({ eventType: "ITEM_DELETED" }))).toBe("normal");
    });
  });

  describe("ad-hoc / custom fields default to NORMAL", () => {
    it("an unrecognized fieldKey (an ObjectField's own opaque id) is NORMAL", () => {
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "a1b2c3d4-opaque-object-field-id" }))).toBe("normal");
    });

    it("Person's icon and color are NORMAL (the ad-hoc default, no collision with another module)", () => {
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "icon", objectType: "PERSON" }))).toBe("normal");
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "color", objectType: "PERSON" }))).toBe("normal");
    });

    it("Person's name is LOW, not NORMAL -- an implementation-time correction to the ticket's own stated interim, since `name` already means LOW for every other module and the classifier has no way to treat one module's `name` differently from another's", () => {
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "name", objectType: "PERSON" }))).toBe("low");
    });

    it("Custom Item's dueDate is NORMAL (interim, pending the user-configurable-priority ticket) -- distinct from Todo's own HIGH dueDate, same literal fieldKey", () => {
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "dueDate", objectType: "CUSTOM_ITEM" }))).toBe("normal");
      expect(classifyEventSignificance(event({ eventType: "FIELD_CHANGED", fieldKey: "dueDate", objectType: "TODO" }))).toBe("high");
    });
  });

  describe("Finance -- Asset/Liability and Income/Expense", () => {
    const finance = (overrides: Partial<ClassifiableEvent>) => event({ objectType: "FINANCE_ITEM", eventType: "FIELD_CHANGED", ...overrides });

    it("notes and name are LOW", () => {
      expect(classifyEventSignificance(finance({ fieldKey: "notes" }))).toBe("low");
      expect(classifyEventSignificance(finance({ fieldKey: "name" }))).toBe("low");
    });

    it("category is NORMAL", () => {
      expect(classifyEventSignificance(finance({ fieldKey: "category" }))).toBe("normal");
    });

    it("start/end date is NORMAL", () => {
      expect(classifyEventSignificance(finance({ fieldKey: "startDate" }))).toBe("normal");
      expect(classifyEventSignificance(finance({ fieldKey: "endDate" }))).toBe("normal");
    });

    it("interest rate, monthly payment, and frequency are unconditionally HIGH", () => {
      expect(classifyEventSignificance(finance({ fieldKey: "rate", oldValue: "5", newValue: "5.01" }))).toBe("high");
      expect(classifyEventSignificance(finance({ fieldKey: "monthlyContribution", oldValue: "100", newValue: "100.01" }))).toBe("high");
      expect(classifyEventSignificance(finance({ fieldKey: "frequency", oldValue: "Monthly", newValue: "Weekly" }))).toBe("high");
    });

    describe("amount -- the magnitude dead zone", () => {
      it("a >= 2% change stays HIGH", () => {
        expect(classifyEventSignificance(finance({ fieldKey: "amount", oldValue: "1000", newValue: "1020" }))).toBe("high");
      });

      it("a < 2% change downgrades to NORMAL", () => {
        expect(classifyEventSignificance(finance({ fieldKey: "amount", oldValue: "1000", newValue: "1010" }))).toBe("normal");
      });

      it("oldValue of 0 or null is treated as maximal magnitude -- stays HIGH", () => {
        expect(classifyEventSignificance(finance({ fieldKey: "amount", oldValue: "0", newValue: "500" }))).toBe("high");
        expect(classifyEventSignificance(finance({ fieldKey: "amount", oldValue: null, newValue: "500" }))).toBe("high");
      });

      it("0 -> 0 is not a real change -- downgrades to NORMAL, not treated as maximal", () => {
        expect(classifyEventSignificance(finance({ fieldKey: "amount", oldValue: "0", newValue: "0" }))).toBe("normal");
      });
    });
  });

  describe("Document", () => {
    const document = (overrides: Partial<ClassifiableEvent>) => event({ objectType: "DOCUMENT", eventType: "FIELD_CHANGED", ...overrides });

    it("notes and name are LOW", () => {
      expect(classifyEventSignificance(document({ fieldKey: "notes" }))).toBe("low");
      expect(classifyEventSignificance(document({ fieldKey: "name" }))).toBe("low");
    });

    it("document number and country are NORMAL", () => {
      expect(classifyEventSignificance(document({ fieldKey: "documentNumber" }))).toBe("normal");
      expect(classifyEventSignificance(document({ fieldKey: "country" }))).toBe("normal");
    });

    it("expiry date is HIGH", () => {
      expect(classifyEventSignificance(document({ fieldKey: "expiryDate" }))).toBe("high");
    });

    it("reminder lead time, issue date, and link are IGNORE -- never shown, not even in History", () => {
      expect(classifyEventSignificance(document({ fieldKey: "prompt" }))).toBe("ignore");
      expect(classifyEventSignificance(document({ fieldKey: "issueDate" }))).toBe("ignore");
      expect(classifyEventSignificance(document({ fieldKey: "link" }))).toBe("ignore");
    });

    it("entering the reminder window (DOCUMENT_EXPIRING_SOON) is HIGH", () => {
      expect(classifyEventSignificance(document({ eventType: "DOCUMENT_EXPIRING_SOON", fieldKey: null }))).toBe("high");
    });

    it("Archived/Restored (ITEM_ARCHIVED/ITEM_RESTORED) are HIGH -- shared with Custom Items, not Document-specific", () => {
      expect(classifyEventSignificance(document({ eventType: "ITEM_ARCHIVED", fieldKey: null }))).toBe("high");
      expect(classifyEventSignificance(document({ eventType: "ITEM_RESTORED", fieldKey: null }))).toBe("high");
      expect(classifyEventSignificance(event({ objectType: "CUSTOM_ITEM", eventType: "ITEM_ARCHIVED" }))).toBe("high");
    });
  });

  describe("Goal", () => {
    const goal = (overrides: Partial<ClassifiableEvent>) => event({ objectType: "GOAL", eventType: "FIELD_CHANGED", ...overrides });

    it("GOAL_COMPLETED is HIGH", () => {
      expect(classifyEventSignificance(goal({ eventType: "GOAL_COMPLETED", fieldKey: null }))).toBe("high");
    });

    it("GOAL_REOPENED is HIGH -- its own dedicated event type now, not just the generic STATUS_CHANGED special case", () => {
      expect(classifyEventSignificance(goal({ eventType: "GOAL_REOPENED", fieldKey: null }))).toBe("high");
    });

    it("every STATUS_CHANGED transition is unconditionally HIGH -- Reopened, Revisit Later, and Archived alike, no value inspection", () => {
      expect(classifyEventSignificance(goal({ eventType: "STATUS_CHANGED", fieldKey: "status", oldValue: "Archived", newValue: "Active" }))).toBe("high");
      expect(classifyEventSignificance(goal({ eventType: "STATUS_CHANGED", fieldKey: "status", oldValue: "Active", newValue: "Revisit Later" }))).toBe("high");
      expect(classifyEventSignificance(goal({ eventType: "STATUS_CHANGED", fieldKey: "status", oldValue: "Active", newValue: "Archived" }))).toBe("high");
    });

    it("target date, target value, current value, and unit are all HIGH", () => {
      expect(classifyEventSignificance(goal({ fieldKey: "targetDate" }))).toBe("high");
      expect(classifyEventSignificance(goal({ fieldKey: "targetValue" }))).toBe("high");
      expect(classifyEventSignificance(goal({ fieldKey: "currentValue" }))).toBe("high");
      expect(classifyEventSignificance(goal({ fieldKey: "unit" }))).toBe("high");
    });

    it("Milestone added is NORMAL, Milestone updated is LOW, completed/reopened are HIGH, deleted is NORMAL", () => {
      expect(classifyEventSignificance(goal({ eventType: "GOAL_MILESTONE_ADDED", fieldKey: null }))).toBe("normal");
      expect(classifyEventSignificance(goal({ eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "name" }))).toBe("low");
      expect(classifyEventSignificance(goal({ eventType: "GOAL_MILESTONE_COMPLETED", fieldKey: null }))).toBe("high");
      expect(classifyEventSignificance(goal({ eventType: "GOAL_MILESTONE_REOPENED", fieldKey: null }))).toBe("high");
      expect(classifyEventSignificance(goal({ eventType: "GOAL_MILESTONE_DELETED", fieldKey: null }))).toBe("normal");
    });
  });

  describe("Todo", () => {
    const todo = (overrides: Partial<ClassifiableEvent>) => event({ objectType: "TODO", eventType: "FIELD_CHANGED", ...overrides });

    it("Completed and Reopened are HIGH", () => {
      expect(classifyEventSignificance(todo({ eventType: "TODO_COMPLETED", fieldKey: null }))).toBe("high");
      expect(classifyEventSignificance(todo({ eventType: "TODO_REOPENED", fieldKey: null }))).toBe("high");
    });

    it("Status changed (To Do <-> Waiting) is HIGH", () => {
      expect(classifyEventSignificance(todo({ eventType: "STATUS_CHANGED", fieldKey: "status", oldValue: "TODO", newValue: "WAITING" }))).toBe("high");
    });

    it("due date is HIGH, notes and title are LOW", () => {
      expect(classifyEventSignificance(todo({ fieldKey: "dueDate" }))).toBe("high");
      expect(classifyEventSignificance(todo({ fieldKey: "notes" }))).toBe("low");
      expect(classifyEventSignificance(todo({ fieldKey: "name" }))).toBe("low");
    });
  });

  describe("Kinesis Link relationship type", () => {
    it("Blocks and Depends on (and their inverse readings) are HIGH", () => {
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "BLOCKS" }))).toBe("high");
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: "BLOCKS" }))).toBe("high");
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "DEPENDS_ON" }))).toBe("high");
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_REMOVED", oldRelationshipType: "DEPENDS_ON" }))).toBe("high");
    });

    it("Supports and Alongside are NORMAL", () => {
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "SUPPORTS" }))).toBe("normal");
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "ALONGSIDE" }))).toBe("normal");
    });

    it("Related to is LOW", () => {
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "RELATES_TO" }))).toBe("low");
    });

    it("any other custom Kinesis Link is NORMAL", () => {
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_ADDED", newRelationshipType: "CUSTOM" }))).toBe("normal");
    });

    it("RELATIONSHIP_CHANGED is unconditionally HIGH, regardless of the old or new type -- the interim rule pending Relationship's own future ticket", () => {
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "RELATES_TO", newRelationshipType: "SUPPORTS" }))).toBe("high");
      expect(classifyEventSignificance(event({ eventType: "RELATIONSHIP_CHANGED", oldRelationshipType: "BLOCKS", newRelationshipType: "RELATES_TO" }))).toBe("high");
    });
  });
});

describe("calculatePercentChange", () => {
  it("computes an absolute percentage magnitude regardless of direction", () => {
    expect(calculatePercentChange({ oldValue: "1000", newValue: "1020" })).toBeCloseTo(2);
    expect(calculatePercentChange({ oldValue: "1000", newValue: "980" })).toBeCloseTo(2);
  });

  it("treats a 0 or null oldValue as maximal (Infinity) when newValue is a real, different value", () => {
    expect(calculatePercentChange({ oldValue: "0", newValue: "500" })).toBe(Infinity);
    expect(calculatePercentChange({ oldValue: null, newValue: "500" })).toBe(Infinity);
  });

  it("treats 0 -> 0 as no change (0%), not maximal", () => {
    expect(calculatePercentChange({ oldValue: "0", newValue: "0" })).toBe(0);
    expect(calculatePercentChange({ oldValue: null, newValue: null })).toBe(0);
  });
});
