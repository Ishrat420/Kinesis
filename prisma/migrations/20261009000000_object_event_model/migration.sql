-- CreateEnum
CREATE TYPE "ObjectEventType" AS ENUM ('FIELD_CHANGED', 'STATUS_CHANGED', 'RELATIONSHIP_ADDED', 'RELATIONSHIP_REMOVED', 'RELATIONSHIP_CHANGED', 'DOCUMENT_ARCHIVED', 'DOCUMENT_RESTORED', 'TODO_COMPLETED', 'TODO_REOPENED', 'GOAL_MILESTONE_COMPLETED', 'GOAL_COMPLETED', 'ITEM_CREATED', 'ITEM_DELETED');

-- CreateEnum
CREATE TYPE "ObjectEventSource" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "ObjectEvent" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "ObjectEventType" NOT NULL,
    "fieldKey" TEXT,
    "fieldLabel" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "oldRelationshipType" "ObjectRelationshipType",
    "newRelationshipType" "ObjectRelationshipType",
    "inverse" BOOLEAN,
    "relatedObjectId" TEXT,
    "relatedObjectName" TEXT,
    "source" "ObjectEventSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObjectEvent_objectId_occurredAt_idx" ON "ObjectEvent"("objectId", "occurredAt");

-- CreateIndex
CREATE INDEX "ObjectEvent_userId_occurredAt_idx" ON "ObjectEvent"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ObjectEvent" ADD CONSTRAINT "ObjectEvent_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectEvent" ADD CONSTRAINT "ObjectEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectEvent" ADD CONSTRAINT "ObjectEvent_relatedObjectId_fkey" FOREIGN KEY ("relatedObjectId") REFERENCES "Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
