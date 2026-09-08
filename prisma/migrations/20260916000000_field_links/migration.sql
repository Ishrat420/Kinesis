-- A Kinesis Link field held at most one target, as a nullable column on
-- ObjectField itself (KD-034). FieldLink replaces that column: a field now
-- holds as many targets as the person adds, one row per target, ordered the
-- way they added them -- and a field with none yet still exists, since the
-- field row itself is what carries the label.

CREATE TABLE "FieldLink" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "targetObjectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FieldLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldLink_fieldId_position_idx" ON "FieldLink"("fieldId", "position");
CREATE INDEX "FieldLink_targetObjectId_idx" ON "FieldLink"("targetObjectId");
ALTER TABLE "FieldLink" ADD CONSTRAINT "FieldLink_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ObjectField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Deleting the target object removes just that token (see the schema doc
-- comment): a field's targets are cascade-deleted with the object they point
-- at, rather than left behind as an empty slot the way the old SetNull did.
ALTER TABLE "FieldLink" ADD CONSTRAINT "FieldLink_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every field that already had a target gets one FieldLink row at
-- position 0.
INSERT INTO "FieldLink" ("id", "fieldId", "targetObjectId", "position")
SELECT gen_random_uuid()::text, "id", "targetObjectId", 0
FROM "ObjectField"
WHERE "targetObjectId" IS NOT NULL;

ALTER TABLE "ObjectField" DROP CONSTRAINT "ObjectField_targetObjectId_fkey";
DROP INDEX "ObjectField_targetObjectId_idx";
ALTER TABLE "ObjectField" DROP COLUMN "targetObjectId";
