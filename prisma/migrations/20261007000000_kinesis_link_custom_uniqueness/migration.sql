-- KD-050: a plain (userId, pairKey, type) unique index treats every CUSTOM
-- Kinesis Link between a given pair as the same slot, regardless of what its
-- customLabel actually says -- so a Person could never hold both a "Backup
-- contact" and an "Emergency contact" Custom link to the same target, and
-- migrating two differently-labeled ad-hoc Kinesis Link Custom Fields that
-- happen to point at the same target would collide on this constraint.
--
-- Fix: CUSTOM-type rows are unique per (userId, pairKey, customLabel)
-- instead, so different text between the same pair is allowed while an
-- exact duplicate still isn't. Every other type keeps the original
-- (userId, pairKey, type) uniqueness. Postgres can't express "customLabel
-- matters only for CUSTOM" as one ordinary index -- NULL never equals NULL
-- in a unique index, so folding the nullable customLabel column into a
-- single index would silently stop enforcing uniqueness for every
-- non-CUSTOM row instead. Two partial unique indexes do express it.
DROP INDEX "ObjectRelationship_userId_pairKey_type_key";
CREATE INDEX "ObjectRelationship_userId_pairKey_type_idx" ON "ObjectRelationship"("userId", "pairKey", "type");
CREATE UNIQUE INDEX "ObjectRelationship_canonical_pair_type_key" ON "ObjectRelationship"("userId", "pairKey", "type") WHERE "type" != 'CUSTOM';
CREATE UNIQUE INDEX "ObjectRelationship_custom_pair_label_key" ON "ObjectRelationship"("userId", "pairKey", "customLabel") WHERE "type" = 'CUSTOM';
