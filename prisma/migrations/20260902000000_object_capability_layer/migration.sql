-- KD-024 follow-up. 20260901000100_universal_object_identity established the
-- Object identity; this migration makes that identity safe to build capabilities
-- on. It must run after it, and after 20260901000000_object_type_values.
--
-- Requires PostgreSQL 13+ for the built-in gen_random_uuid().

-- 1. Object ids stop encoding the module that minted them --------------------
-- The backfill derived ids such as 'goal:<goal id>', so the column held two
-- shapes at once and invited callers to rebuild an object id by concatenation.
-- Every objectId foreign key is ON UPDATE CASCADE, so the typed records and the
-- relationship rows follow the new ids on their own. A UUID never contains ':',
-- which makes the predicate both correct and re-runnable.
UPDATE "Object" SET "id" = gen_random_uuid()::text WHERE "id" LIKE '%:%';

-- pairKey is derived from the two object ids and cascade does not recompute it.
-- The 'GOAL:' prefix predates object identity and no longer says anything true:
-- a pair of object ids is already unique across every type. Old keys all start
-- with 'GOAL:' and new ones cannot, so no row collides with another's old key
-- while this statement runs.
UPDATE "ObjectRelationship"
SET "pairKey" = LEAST("sourceObjectId", "targetObjectId") || ':' || GREATEST("sourceObjectId", "targetObjectId");

-- 2. Object.updatedAt claimed more than it knew ------------------------------
-- It only moved when the identity row itself was written, so it tracked renames
-- and nothing else. Cross-module recency already lives in ActivityEvent.
ALTER TABLE "Object" DROP COLUMN IF EXISTS "updatedAt";

-- 3. Object.name is derived by the database, not copied by each write path ----
-- Four call sites had to remember to mirror a rename onto the identity row, and
-- a fifth module or a new rename action would silently desync it.
CREATE OR REPLACE FUNCTION "kinesis_sync_object_name"() RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Object"
  SET "name" = NEW."name"
  WHERE "id" = NEW."objectId" AND "name" IS DISTINCT FROM NEW."name";
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kinesis_sync_object_name" ON "Document";
CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "Document"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();

DROP TRIGGER IF EXISTS "kinesis_sync_object_name" ON "Goal";
CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "Goal"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();

DROP TRIGGER IF EXISTS "kinesis_sync_object_name" ON "FinanceItem";
CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "FinanceItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();

DROP TRIGGER IF EXISTS "kinesis_sync_object_name" ON "Person";
CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "Person"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();

DROP TRIGGER IF EXISTS "kinesis_sync_object_name" ON "CustomItem";
CREATE TRIGGER "kinesis_sync_object_name" AFTER INSERT OR UPDATE OF "name", "objectId" ON "CustomItem"
FOR EACH ROW EXECUTE FUNCTION "kinesis_sync_object_name"();

UPDATE "Object" o SET "name" = d."name" FROM "Document" d    WHERE d."objectId" = o."id" AND o."name" IS DISTINCT FROM d."name";
UPDATE "Object" o SET "name" = g."name" FROM "Goal" g        WHERE g."objectId" = o."id" AND o."name" IS DISTINCT FROM g."name";
UPDATE "Object" o SET "name" = f."name" FROM "FinanceItem" f WHERE f."objectId" = o."id" AND o."name" IS DISTINCT FROM f."name";
UPDATE "Object" o SET "name" = p."name" FROM "Person" p      WHERE p."objectId" = o."id" AND o."name" IS DISTINCT FROM p."name";
UPDATE "Object" o SET "name" = i."name" FROM "CustomItem" i  WHERE i."objectId" = o."id" AND o."name" IS DISTINCT FROM i."name";

-- 3b. Drift left behind by the pre-migration-history era -----------------------
-- 20260821020000_notifications created this index, the schema has never declared
-- it, and `db push` had already dropped it wherever it ran. Dropping it here is
-- what makes a migrate-built database and a db push-built one identical.
DROP INDEX IF EXISTS "Notification_createdAt_idx";

-- 4. Kinesis Links point at Object instead of a type plus a raw id -----------
-- (targetType, targetId) had no foreign key, so deleting a linked record left
-- the link dangling. Links whose target is already gone resolve to NULL here,
-- which is the state the reader always rendered them as anyway.
ALTER TABLE "DocumentField" ADD COLUMN IF NOT EXISTS "targetObjectId" TEXT;
ALTER TABLE "CustomItemField" ADD COLUMN IF NOT EXISTS "targetObjectId" TEXT;

UPDATE "DocumentField" f SET "targetObjectId" = d."objectId" FROM "Document" d   WHERE f."targetType" = 'DOCUMENT'    AND f."targetId" = d."id";
UPDATE "DocumentField" f SET "targetObjectId" = g."objectId" FROM "Goal" g       WHERE f."targetType" = 'GOAL'        AND f."targetId" = g."id";
UPDATE "DocumentField" f SET "targetObjectId" = i."objectId" FROM "CustomItem" i WHERE f."targetType" = 'CUSTOM_ITEM' AND f."targetId" = i."id";

UPDATE "CustomItemField" f SET "targetObjectId" = d."objectId" FROM "Document" d   WHERE f."targetType" = 'DOCUMENT'    AND f."targetId" = d."id";
UPDATE "CustomItemField" f SET "targetObjectId" = g."objectId" FROM "Goal" g       WHERE f."targetType" = 'GOAL'        AND f."targetId" = g."id";
UPDATE "CustomItemField" f SET "targetObjectId" = i."objectId" FROM "CustomItem" i WHERE f."targetType" = 'CUSTOM_ITEM' AND f."targetId" = i."id";

DROP INDEX IF EXISTS "DocumentField_targetType_targetId_idx";
DROP INDEX IF EXISTS "CustomItemField_targetType_targetId_idx";
ALTER TABLE "DocumentField" DROP COLUMN "targetType", DROP COLUMN "targetId";
ALTER TABLE "CustomItemField" DROP COLUMN "targetType", DROP COLUMN "targetId";

CREATE INDEX "DocumentField_targetObjectId_idx" ON "DocumentField"("targetObjectId");
CREATE INDEX "CustomItemField_targetObjectId_idx" ON "CustomItemField"("targetObjectId");
ALTER TABLE "DocumentField" ADD CONSTRAINT "DocumentField_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomItemField" ADD CONSTRAINT "CustomItemField_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
