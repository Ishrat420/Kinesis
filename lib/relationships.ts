export type ConnectionPracticeEntry = { title: string; cadence: string };
export type ReflectionEntry = { text: string; date: string };
export type ImportantDateEntry = { label: string; date: string };
/** The private space a person keeps for the relationship they have with themselves (KD-021). Deliberately has no linked goals. */
export type SelfRelationship = { practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; importantDates: ImportantDateEntry[]; notes: string };
export type RelationshipPerson = { id: string; name: string; detail: string; x: number; y: number; size: number; color: string; icon: "user" | "heart" | "baby" | "cat" | "home"; selfRelationship: SelfRelationship };
export type RelationshipRecord = { id: string; from: string; to: string; type: string | null; practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; linkedGoals: string[]; importantDates: ImportantDateEntry[]; notes: string };
export type RelationshipMapData = { people: RelationshipPerson[]; relationships: RelationshipRecord[] };

export function emptySelfRelationship(): SelfRelationship {
  return { practices: [], reflections: [], importantDates: [], notes: "" };
}

/** The self bubble is the one the map labels "You"; every other person is an ordinary relationship. */
export function isSelfPerson(person: { detail: string }) {
  return person.detail === "You";
}

/**
 * Connections are undirected, so a relationship between two people counts whichever
 * way round it was stored. Used to keep the map from creating reversed duplicates.
 */
export function hasRelationshipBetween(relationships: readonly Pick<RelationshipRecord, "from" | "to">[], personAId: string, personBId: string) {
  return relationships.some((relationship) => (relationship.from === personAId && relationship.to === personBId) || (relationship.from === personBId && relationship.to === personAId));
}

/** Ctrl/Cmd-click selects at most two people on the constellation, so a third pick replaces the second. */
export const MAX_CONNECT_SELECTION = 2;

export function toggleMultiSelect(selected: readonly string[], personId: string, max = MAX_CONNECT_SELECTION): string[] {
  if (selected.includes(personId)) return selected.filter((id) => id !== personId);
  if (selected.length < max) return [...selected, personId];
  return [...selected.slice(0, max - 1), personId];
}

export type ConnectPairStatus = "incomplete" | "same-person" | "already-connected" | "ready";

/** Whether a Ctrl/Cmd multi-selection can turn into a new connection, and if not, why not. */
export function connectPairStatus(selected: readonly string[], relationships: readonly Pick<RelationshipRecord, "from" | "to">[]): ConnectPairStatus {
  if (selected.length !== MAX_CONNECT_SELECTION) return "incomplete";
  const [firstPersonId, secondPersonId] = selected;
  if (firstPersonId === secondPersonId) return "same-person";
  if (hasRelationshipBetween(relationships, firstPersonId, secondPersonId)) return "already-connected";
  return "ready";
}
