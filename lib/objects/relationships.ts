/**
 * A relationship is undirected, so both ends produce the same key and the unique
 * index on (userId, pairKey) rejects the mirror image of an existing link.
 *
 * The 20260902000000 migration builds the same key with LEAST/GREATEST. Object
 * ids are UUIDs, so the two orderings agree: hyphens sit at the same offsets in
 * every id, and digits sort before letters under both C and en_US collations.
 */
export function objectPairKey(firstObjectId: string, secondObjectId: string) {
  return [firstObjectId, secondObjectId].sort().join(":");
}
