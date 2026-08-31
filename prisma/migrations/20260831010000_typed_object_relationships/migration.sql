CREATE TYPE "ObjectRelationshipType" AS ENUM ('SUPPORTS', 'BLOCKS', 'DEPENDS_ON', 'RELATES_TO', 'ALONGSIDE');

CREATE TABLE "ObjectRelationship" (
    "id" TEXT NOT NULL,
    "sourceObjectType" "KinesisObjectType" NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "targetObjectType" "KinesisObjectType" NOT NULL,
    "targetObjectId" TEXT NOT NULL,
    "type" "ObjectRelationshipType" NOT NULL,
    "pairKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ObjectRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObjectRelationship_userId_pairKey_key" ON "ObjectRelationship"("userId", "pairKey");
CREATE INDEX "ObjectRelationship_userId_sourceObjectType_sourceObjectId_idx" ON "ObjectRelationship"("userId", "sourceObjectType", "sourceObjectId");
CREATE INDEX "ObjectRelationship_userId_targetObjectType_targetObjectId_idx" ON "ObjectRelationship"("userId", "targetObjectType", "targetObjectId");
ALTER TABLE "ObjectRelationship" ADD CONSTRAINT "ObjectRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
