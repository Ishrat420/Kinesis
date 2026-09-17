-- The bell's own ordering: which notification reached the owner first,
-- independent of the deadline it's about and of whether (or when) anyone
-- has read it. Written once per itemKey, the first time collectNotifications
-- derives it and finds no row here yet -- never touched again afterwards.
-- Same shape as NotificationRead: one nullable FK per notification source,
-- purely for referential integrity, so deleting the record takes its
-- first-seen row with it too.

-- CreateTable
CREATE TABLE "NotificationFirstSeen" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "documentId" TEXT,
    "milestoneId" TEXT,
    "relationshipDateId" TEXT,
    "customItemId" TEXT,
    "todoId" TEXT,
    "userId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationFirstSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationFirstSeen_documentId_idx" ON "NotificationFirstSeen"("documentId");

-- CreateIndex
CREATE INDEX "NotificationFirstSeen_milestoneId_idx" ON "NotificationFirstSeen"("milestoneId");

-- CreateIndex
CREATE INDEX "NotificationFirstSeen_relationshipDateId_idx" ON "NotificationFirstSeen"("relationshipDateId");

-- CreateIndex
CREATE INDEX "NotificationFirstSeen_customItemId_idx" ON "NotificationFirstSeen"("customItemId");

-- CreateIndex
CREATE INDEX "NotificationFirstSeen_todoId_idx" ON "NotificationFirstSeen"("todoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationFirstSeen_userId_itemKey_key" ON "NotificationFirstSeen"("userId", "itemKey");

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_relationshipDateId_fkey" FOREIGN KEY ("relationshipDateId") REFERENCES "RelationshipImportantDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_customItemId_fkey" FOREIGN KEY ("customItemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mirrors NotificationRead_exactly_one_parent / AttentionDismissal_exactly_one_parent
-- (20260925000000_relationship_exactly_one_parent): exactly one source FK is
-- ever set on a given row.
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_exactly_one_parent" CHECK (num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId") = 1);
