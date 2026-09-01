-- Establish a stable, user-facing identity without replacing the typed domain records.
CREATE TABLE "Object" (
    "id" TEXT NOT NULL,
    "type" "KinesisObjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Object_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document" ADD COLUMN "objectId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "objectId" TEXT;
ALTER TABLE "FinanceItem" ADD COLUMN "objectId" TEXT;
ALTER TABLE "Person" ADD COLUMN "objectId" TEXT;
ALTER TABLE "CustomItem" ADD COLUMN "objectId" TEXT;

-- Generate independent Object IDs: domain IDs are not assumed to be globally unique.
INSERT INTO "Object" ("id", "type", "name", "userId", "createdAt", "updatedAt")
SELECT 'document:' || "id", 'DOCUMENT', "name", "userId", "createdAt", "updatedAt" FROM "Document";
UPDATE "Document" SET "objectId" = 'document:' || "id";

INSERT INTO "Object" ("id", "type", "name", "userId", "createdAt", "updatedAt")
SELECT 'goal:' || "id", 'GOAL', "name", "userId", "createdAt", "updatedAt" FROM "Goal";
UPDATE "Goal" SET "objectId" = 'goal:' || "id";

INSERT INTO "Object" ("id", "type", "name", "userId", "createdAt", "updatedAt")
SELECT 'finance-item:' || "id", 'FINANCE_ITEM', "name", "userId", "createdAt", "updatedAt" FROM "FinanceItem";
UPDATE "FinanceItem" SET "objectId" = 'finance-item:' || "id";

INSERT INTO "Object" ("id", "type", "name", "userId", "createdAt", "updatedAt")
SELECT 'person:' || "id", 'PERSON', "name", "userId", "createdAt", "updatedAt" FROM "Person";
UPDATE "Person" SET "objectId" = 'person:' || "id";

INSERT INTO "Object" ("id", "type", "name", "userId", "createdAt", "updatedAt")
SELECT 'custom-item:' || i."id", 'CUSTOM_ITEM', i."name", m."userId", i."createdAt", i."updatedAt"
FROM "CustomItem" i JOIN "CustomModule" m ON m."id" = i."moduleId";
UPDATE "CustomItem" SET "objectId" = 'custom-item:' || "id";

-- Convert existing polymorphic goal links to real Object foreign keys.
UPDATE "ObjectRelationship" r SET "sourceObjectId" = g."objectId"
FROM "Goal" g WHERE r."sourceObjectType" = 'GOAL' AND r."sourceObjectId" = g."id";
UPDATE "ObjectRelationship" r SET "targetObjectId" = g."objectId"
FROM "Goal" g WHERE r."targetObjectType" = 'GOAL' AND r."targetObjectId" = g."id";
UPDATE "ObjectRelationship" SET "pairKey" = 'GOAL:' || LEAST("sourceObjectId", "targetObjectId") || ':' || GREATEST("sourceObjectId", "targetObjectId");
ALTER TABLE "ObjectRelationship" DROP COLUMN "sourceObjectType", DROP COLUMN "targetObjectType";

ALTER TABLE "Document" ALTER COLUMN "objectId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "objectId" SET NOT NULL;
ALTER TABLE "FinanceItem" ALTER COLUMN "objectId" SET NOT NULL;
ALTER TABLE "Person" ALTER COLUMN "objectId" SET NOT NULL;
ALTER TABLE "CustomItem" ALTER COLUMN "objectId" SET NOT NULL;

CREATE UNIQUE INDEX "Document_objectId_key" ON "Document"("objectId");
CREATE UNIQUE INDEX "Goal_objectId_key" ON "Goal"("objectId");
CREATE UNIQUE INDEX "FinanceItem_objectId_key" ON "FinanceItem"("objectId");
CREATE UNIQUE INDEX "Person_objectId_key" ON "Person"("objectId");
CREATE UNIQUE INDEX "CustomItem_objectId_key" ON "CustomItem"("objectId");
CREATE INDEX "Object_userId_type_name_idx" ON "Object"("userId", "type", "name");
DROP INDEX "ObjectRelationship_userId_sourceObjectType_sourceObjectId_idx";
DROP INDEX "ObjectRelationship_userId_targetObjectType_targetObjectId_idx";
CREATE INDEX "ObjectRelationship_userId_sourceObjectId_idx" ON "ObjectRelationship"("userId", "sourceObjectId");
CREATE INDEX "ObjectRelationship_userId_targetObjectId_idx" ON "ObjectRelationship"("userId", "targetObjectId");

ALTER TABLE "Object" ADD CONSTRAINT "Object_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObjectRelationship" ADD CONSTRAINT "ObjectRelationship_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObjectRelationship" ADD CONSTRAINT "ObjectRelationship_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
