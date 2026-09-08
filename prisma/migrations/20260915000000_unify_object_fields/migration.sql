-- DocumentField and CustomItemField were structurally identical -- label,
-- value, type, targetObjectId, position -- differing only in which table a row
-- pointed back at. Both hosts already carry an Object identity (Document and
-- CustomItem each have a unique objectId), so ObjectField replaces both,
-- keyed on that identity instead of on the specific host table.

CREATE TABLE "ObjectField" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "targetObjectId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ObjectField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ObjectField_objectId_position_idx" ON "ObjectField"("objectId", "position");
CREATE INDEX "ObjectField_targetObjectId_idx" ON "ObjectField"("targetObjectId");
ALTER TABLE "ObjectField" ADD CONSTRAINT "ObjectField_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObjectField" ADD CONSTRAINT "ObjectField_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: each old row keeps its own id (both were random UUIDs, drawn from
-- the same generator, so a collision between the two source tables is not a
-- real possibility) and moves to the objectId its Document or CustomItem
-- already carries.
INSERT INTO "ObjectField" ("id", "objectId", "label", "value", "type", "targetObjectId", "position")
SELECT f."id", d."objectId", f."label", f."value", f."type", f."targetObjectId", f."position"
FROM "DocumentField" f
JOIN "Document" d ON d."id" = f."documentId";

INSERT INTO "ObjectField" ("id", "objectId", "label", "value", "type", "targetObjectId", "position")
SELECT f."id", i."objectId", f."label", f."value", f."type", f."targetObjectId", f."position"
FROM "CustomItemField" f
JOIN "CustomItem" i ON i."id" = f."itemId";

DROP TABLE "DocumentField";
DROP TABLE "CustomItemField";
