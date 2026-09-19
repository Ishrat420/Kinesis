import type { ObjectRelationshipType } from "@prisma/client";

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

/**
 * The label actually shown for a Kinesis Link, from the current Object's
 * side. `CUSTOM` has no entry in `labels` above -- its text is whatever was
 * typed for that one relationship (KD-049 ad-hoc custom text), read straight
 * off the row rather than looked up here. `customLabel` is only ever null for
 * a row that predates a value being required, which can't happen yet but
 * costs nothing to fall back on.
 */
export function kinesisLinkLabel(type: ObjectRelationshipType, customLabel: string | null, inverse: boolean): string {
  if (type === "CUSTOM") return customLabel ?? "Related to";
  return relationshipLabel(type, inverse);
}

/** One picker option per selectable direction of a canonical type, or the ad-hoc Custom sentinel. */
export type KinesisLinkDirectionOption = { value: string; label: string; type: ObjectRelationshipTypeValue; inverse: boolean };

/**
 * Both directions of every canonical type, spelled out as their own option --
 * 8 entries, not 10, because a symmetric type (`RELATES_TO`, `ALONGSIDE`)
 * reads the same either way and gets one option, not two identical-looking
 * ones. Picking an inverse-facing option (e.g. "Supported by") is what lets a
 * Kinesis Link be described directly from either side, rather than always
 * needing translating into the forward wording first (KD-049 §6).
 */
export const KINESIS_LINK_DIRECTION_OPTIONS: KinesisLinkDirectionOption[] = OBJECT_RELATIONSHIP_TYPES.flatMap((type) => {
  const forward: KinesisLinkDirectionOption = { value: `${type}|forward`, label: relationshipLabel(type, false), type, inverse: false };
  const inverseLabel = relationshipLabel(type, true);
  return inverseLabel === forward.label ? [forward] : [forward, { value: `${type}|inverse`, label: inverseLabel, type, inverse: true }];
});

/** The picker's 9th option -- reveals a free-text input rather than resolving to a canonical type. */
export const CUSTOM_KINESIS_LINK_OPTION_VALUE = "CUSTOM";

/** The inverse of `KINESIS_LINK_DIRECTION_OPTIONS`' `value` encoding, for reading a submitted picker choice back. */
export function parseKinesisLinkDirectionValue(value: string): { type: ObjectRelationshipTypeValue; inverse: boolean } | null {
  const option = KINESIS_LINK_DIRECTION_OPTIONS.find((candidate) => candidate.value === value);
  return option ? { type: option.type, inverse: option.inverse } : null;
}

/**
 * The `KINESIS_LINK_DIRECTION_OPTIONS` value matching a stored (type,
 * inverse) pair -- for preselecting a picker to reflect an existing Kinesis
 * Link. Falls back to the forward option for a symmetric type (`RELATES_TO`,
 * `ALONGSIDE`), since `inverse: true` never got its own option there in the
 * first place; hand-building `${type}|inverse` at a call site would silently
 * match nothing for exactly those two types.
 */
export function kinesisLinkDirectionValue(type: ObjectRelationshipTypeValue, inverse: boolean): string {
  const exact = KINESIS_LINK_DIRECTION_OPTIONS.find((option) => option.type === type && option.inverse === inverse);
  return (exact ?? KINESIS_LINK_DIRECTION_OPTIONS.find((option) => option.type === type)!).value;
}
