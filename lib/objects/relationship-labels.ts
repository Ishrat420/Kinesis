/**
 * The canonical Kinesis Link types and their forward/inverse labels (KD-049).
 *
 * Moved here from `lib/goals/relationships.ts` unchanged -- Goal <-> Goal was
 * this table's first user, not its only one. `CUSTOM` (an ad-hoc, per-link
 * free-text label, stored on `ObjectRelationship.customLabel`) deliberately
 * has no entry here: it isn't a canonical label to look up, it's whatever
 * text was typed for that one relationship, read directly off the row
 * wherever it's shown.
 */
export const OBJECT_RELATIONSHIP_TYPES = ["SUPPORTS", "BLOCKS", "DEPENDS_ON", "RELATES_TO", "ALONGSIDE"] as const;
export type ObjectRelationshipTypeValue = typeof OBJECT_RELATIONSHIP_TYPES[number];

const labels: Record<ObjectRelationshipTypeValue, { forward: string; inverse: string }> = {
  SUPPORTS: { forward: "Supports", inverse: "Supported by" },
  BLOCKS: { forward: "Blocks", inverse: "Blocked by" },
  DEPENDS_ON: { forward: "Depends on", inverse: "Required for" },
  RELATES_TO: { forward: "Related to", inverse: "Related to" },
  ALONGSIDE: { forward: "Alongside", inverse: "Alongside" },
};

export function relationshipLabel(type: ObjectRelationshipTypeValue, inverse = false) {
  return labels[type][inverse ? "inverse" : "forward"];
}
