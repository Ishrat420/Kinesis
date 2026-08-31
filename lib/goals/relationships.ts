export const GOAL_RELATIONSHIP_TYPES = ["SUPPORTS", "BLOCKS", "DEPENDS_ON", "RELATES_TO", "ALONGSIDE"] as const;
export type GoalRelationshipType = typeof GOAL_RELATIONSHIP_TYPES[number];

const labels: Record<GoalRelationshipType, { forward: string; inverse: string }> = {
  SUPPORTS: { forward: "Supports", inverse: "Supported by" },
  BLOCKS: { forward: "Blocks", inverse: "Blocked by" },
  DEPENDS_ON: { forward: "Depends on", inverse: "Required for" },
  RELATES_TO: { forward: "Related to", inverse: "Related to" },
  ALONGSIDE: { forward: "Alongside", inverse: "Alongside" },
};

export function relationshipLabel(type: GoalRelationshipType, inverse = false) {
  return labels[type][inverse ? "inverse" : "forward"];
}

export function goalPairKey(firstId: string, secondId: string) {
  return `GOAL:${[firstId, secondId].sort().join(":")}`;
}
