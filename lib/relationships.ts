import { parseDateOnly } from "@/lib/dates";

/**
 * How often a connection practice comes round.
 *
 * This used to be free text, which read well and did nothing: the calendar's
 * recurrence reader only ever understood a handful of phrasings, and anything
 * else produced no occurrences at all with no indication why. A fixed
 * vocabulary is the smaller promise, and it is one the calendar keeps.
 */
export const PRACTICE_CADENCES = ["Daily", "Weekly", "Fortnightly", "Monthly", "Yearly"] as const;
export type PracticeCadence = (typeof PRACTICE_CADENCES)[number];

export function isPracticeCadence(value: unknown): value is PracticeCadence {
  return typeof value === "string" && (PRACTICE_CADENCES as readonly string[]).includes(value);
}

/**
 * A practice keeps its own id and anchor date.
 *
 * Both exist for the same reason: identity. These rows used to be discarded and
 * re-created on every save, which minted new ids and reset `createdAt` -- and
 * since `createdAt` was what the calendar measured recurrence from, a weekly
 * practice moved to whatever weekday the map was last edited on. The id keeps
 * the row alive across a save; the anchor states the schedule outright so
 * nothing has to infer it.
 */
export type ConnectionPracticeEntry = { id: string; title: string; cadence: string; anchorDate: string };
export type ReflectionEntry = { id: string; text: string; date: string };
export type ImportantDateEntry = { id: string; label: string; date: string; repeatsYearly: boolean };
/** The private space a person keeps for the relationship they have with themselves (KD-021). Deliberately has no linked goals. */
export type SelfRelationship = { practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; importantDates: ImportantDateEntry[]; notes: string };
export type RelationshipPerson = { id: string; name: string; detail: string; x: number; y: number; size: number; color: string; icon: "user" | "heart" | "baby" | "cat" | "home"; selfRelationship: SelfRelationship };
export type RelationshipRecord = { id: string; from: string; to: string; type: string | null; practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; linkedGoals: string[]; importantDates: ImportantDateEntry[]; notes: string };
export type RelationshipMapData = { people: RelationshipPerson[]; relationships: RelationshipRecord[] };

export const PERSON_ICONS = ["user", "heart", "baby", "cat", "home"] as const;

export function emptySelfRelationship(): SelfRelationship {
  return { practices: [], reflections: [], importantDates: [], notes: "" };
}

/** The self bubble is the one the map labels "You"; every other person is an ordinary relationship. */
export function isSelfPerson(person: { detail: string }) {
  return person.detail === "You";
}

/**
 * Where a bubble sits, and how big it is.
 *
 * Geometry is split out from everything else because it is the one part of the
 * map that changes constantly -- every drag moves it -- and the one part that
 * costs nothing to write: three columns on a row that already exists. It saves
 * on its own, so dragging a bubble no longer drags the whole relationship graph
 * through a rewrite behind it.
 */
export type PersonGeometry = { id: string; x: number; y: number; size: number };

export function mapGeometry(people: readonly RelationshipPerson[]): PersonGeometry[] {
  return people.map(({ id, x, y, size }) => ({ id, x, y, size }));
}

/**
 * Content is everything a save writes *except* geometry.
 *
 * The fingerprint drives the Save button's enabled state, so it is built from
 * explicit arrays rather than `JSON.stringify` over the objects themselves: two
 * objects carrying the same values in a different key order are the same
 * content, and a save prompt that appeared because a key moved would train the
 * owner to ignore it. Arrays serialise in the order written, and JSON quoting
 * keeps one field's value from running into the next.
 */
export function contentFingerprint(data: RelationshipMapData): string {
  const practice = (item: ConnectionPracticeEntry) => [item.id, item.title, item.cadence, item.anchorDate];
  const reflection = (item: ReflectionEntry) => [item.id, item.text, item.date];
  const importantDate = (item: ImportantDateEntry) => [item.id, item.label, item.date, item.repeatsYearly];
  const shared = (item: { practices: ConnectionPracticeEntry[]; reflections: ReflectionEntry[]; importantDates: ImportantDateEntry[]; notes: string }) => [
    item.practices.map(practice),
    item.reflections.map(reflection),
    item.importantDates.map(importantDate),
    item.notes,
  ];

  return JSON.stringify([
    data.people.map((person) => [person.id, person.name, person.detail, person.color, person.icon, shared(person.selfRelationship)]),
    data.relationships.map((item) => [item.id, item.from, item.to, item.type, item.notes, item.linkedGoals, shared(item)]),
  ]);
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

/**
 * What the map is allowed to send.
 *
 * The whole map arrives from the browser in one payload, ids included, so this
 * is the only thing standing between a malformed edit and a half-applied write.
 * It runs before the transaction opens and returns the first problem as a
 * sentence the inspector can show, because a save that fails has to say why --
 * the previous version discarded the promise entirely and left the owner
 * believing an edit had landed.
 */
const MAX_PEOPLE = 500;
const MAX_RELATIONSHIPS = 2_000;
const MAX_CHILDREN = 500;
const COORDINATE_LIMIT = 100_000;

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isFilledText = (value: unknown, max: number): value is string => isText(value, max) && value.trim().length > 0;
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= COORDINATE_LIMIT;
const isBubbleSize = (value: unknown) => Number.isInteger(value) && (value as number) >= 32 && (value as number) <= 400;

type SharedInput = { practices?: unknown; reflections?: unknown; importantDates?: unknown; notes?: unknown };

function validateShared({ practices, reflections, importantDates, notes }: SharedInput, label: string): string | null {
  if (!Array.isArray(practices) || practices.length > MAX_CHILDREN) return `${label} has too many connection practices.`;
  for (const practice of practices) {
    if (!isId(practice?.id) || !isFilledText(practice?.title, 120)) return `${label} has a connection practice without a name.`;
    if (!isFilledText(practice?.cadence, 60)) return `${label} has a connection practice without a frequency.`;
    if (!parseDateOnly(String(practice?.anchorDate ?? ""))) return `${label} has a connection practice with an invalid start date.`;
  }
  if (!Array.isArray(reflections) || reflections.length > MAX_CHILDREN) return `${label} has too many reflections.`;
  for (const reflection of reflections) {
    if (!isId(reflection?.id) || !isFilledText(reflection?.text, 5_000)) return `${label} has an empty reflection.`;
    if (!parseDateOnly(String(reflection?.date ?? ""))) return `${label} has a reflection with an invalid date.`;
  }
  if (!Array.isArray(importantDates) || importantDates.length > MAX_CHILDREN) return `${label} has too many important dates.`;
  for (const importantDate of importantDates) {
    if (!isId(importantDate?.id) || !isFilledText(importantDate?.label, 120)) return `${label} has an important date without a name.`;
    if (!parseDateOnly(String(importantDate?.date ?? ""))) return `${label} has an important date with an invalid date.`;
    if (typeof importantDate?.repeatsYearly !== "boolean") return `${label} has an important date that does not say whether it repeats.`;
  }
  if (!isText(notes, 10_000)) return `${label} has notes that are too long.`;
  return null;
}

export function validateRelationshipMap(data: RelationshipMapData): string | null {
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.relationships)) return "The map could not be read.";
  if (data.people.length > MAX_PEOPLE) return `A map cannot hold more than ${MAX_PEOPLE} people.`;
  if (data.relationships.length > MAX_RELATIONSHIPS) return `A map cannot hold more than ${MAX_RELATIONSHIPS} connections.`;

  const peopleIds = new Set<string>();
  for (const person of data.people) {
    if (!isId(person?.id)) return "Someone on the map is missing an identity.";
    if (peopleIds.has(person.id)) return "The same person appears on the map twice.";
    peopleIds.add(person.id);
    if (!isFilledText(person.name, 120)) return "Every person needs a name.";
    if (!isText(person.detail, 120)) return `${person.name}'s description is too long.`;
    if (!isCoordinate(person.x) || !isCoordinate(person.y)) return `${person.name} is positioned off the map.`;
    if (!isBubbleSize(person.size)) return `${person.name}'s bubble is an impossible size.`;
    if (!/^#[0-9a-f]{6}$/i.test(String(person.color))) return `${person.name} has an invalid colour.`;
    if (!(PERSON_ICONS as readonly string[]).includes(person.icon)) return `${person.name} has an invalid icon.`;
    const problem = validateShared(person.selfRelationship ?? {}, person.name);
    if (problem) return problem;
  }

  const relationshipIds = new Set<string>();
  const pairs = new Set<string>();
  for (const relationship of data.relationships) {
    if (!isId(relationship?.id)) return "A connection on the map is missing an identity.";
    if (relationshipIds.has(relationship.id)) return "The same connection appears on the map twice.";
    relationshipIds.add(relationship.id);
    if (!peopleIds.has(relationship.from) || !peopleIds.has(relationship.to)) return "A connection points at someone who is not on the map.";
    if (relationship.from === relationship.to) return "A person cannot be connected to themselves.";
    // The database holds the pair in the order it was written, but a connection
    // means the same thing either way round -- so the duplicate check has to be
    // order-independent, or a reversed pair would slip past it and fail on the
    // unique constraint instead, mid-transaction.
    const pair = JSON.stringify([relationship.from, relationship.to].sort());
    if (pairs.has(pair)) return "Two of these people are connected twice.";
    pairs.add(pair);
    if (relationship.type !== null && !isText(relationship.type, 60)) return "A connection's type is too long.";
    if (!Array.isArray(relationship.linkedGoals) || relationship.linkedGoals.some((goalId) => !isId(goalId))) return "A connection links to an invalid goal.";
    if (new Set(relationship.linkedGoals).size !== relationship.linkedGoals.length) return "A connection links to the same goal twice.";
    const problem = validateShared(relationship, "This connection");
    if (problem) return problem;
  }

  return null;
}

/** What geometry autosave is allowed to send. The same rules, without the rest of the map. */
export function validateGeometry(geometry: readonly PersonGeometry[]): string | null {
  if (!Array.isArray(geometry) || geometry.length > MAX_PEOPLE) return "The map could not be read.";
  const seen = new Set<string>();
  for (const person of geometry) {
    if (!isId(person?.id) || seen.has(person.id)) return "The map could not be read.";
    seen.add(person.id);
    if (!isCoordinate(person.x) || !isCoordinate(person.y)) return "A bubble was moved off the map.";
    if (!isBubbleSize(person.size)) return "A bubble was given an impossible size.";
  }
  return null;
}
