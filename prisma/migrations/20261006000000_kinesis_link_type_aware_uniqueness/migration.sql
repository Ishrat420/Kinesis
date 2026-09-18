-- KD-049 Phase 1: a pair may hold one relationship *per type*, not just one
-- relationship overall -- "Goal A SUPPORTS Goal B" and "Goal A ALONGSIDE Goal B"
-- are both valid at once, each its own row. "One canonical relationship" means
-- one row represents a relationship and its inverse is derived from that row,
-- never stored a second time -- it does not mean two Objects can only ever
-- hold one relationship of any kind between them.
--
-- This also resolves a real collision, not just a theoretical one: a To-Do's
-- own incidental RELATES_TO link to an Object occupied the same
-- (userId, pairKey) slot a deliberate typed Kinesis Link between that same
-- pair would want, so adding one after the other used to fail as "already
-- linked". Scoping uniqueness to (userId, pairKey, type) instead lets both
-- exist; a pair can still only hold one relationship of a *given* type, which
-- is the one row whose inverse is derived.
DROP INDEX "ObjectRelationship_userId_pairKey_key";
CREATE UNIQUE INDEX "ObjectRelationship_userId_pairKey_type_key" ON "ObjectRelationship"("userId", "pairKey", "type");

-- Ad-hoc custom label: typed fresh per relationship when type = CUSTOM, shown
-- on both sides for now (no separate forward/inverse custom text). Never
-- saved anywhere as a reusable named type -- that's a materially bigger,
-- deliberately deferred feature (a "custom label template").
ALTER TABLE "ObjectRelationship" ADD COLUMN "customLabel" TEXT;

-- Nothing in this migration uses the new value, so adding it here is safe
-- despite running in the same transaction as the statements above.
ALTER TYPE "ObjectRelationshipType" ADD VALUE 'CUSTOM';
