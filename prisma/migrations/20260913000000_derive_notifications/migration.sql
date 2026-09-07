-- Notifications stop being stored and start being derived.
--
-- They were only ever a function of the records, the day and the reminder
-- settings -- the same shape Needs Attention already had, computed fresh on
-- every read. Materialising them meant a second copy that had to be kept in
-- step, and the engine kept it in step by deleting and re-inserting every row
-- on every page render: two to three writes per record, per view, whether or
-- not anything had changed. On a serverless database that is a round trip
-- each, and the pool is what runs out first.
--
-- What cannot be derived is which of them the owner has already read, so that
-- is all this keeps. Read state does not survive the change: every reminder is
-- unread once, on the next visit.

DROP TABLE "Notification";

CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "documentId" TEXT,
    "milestoneId" TEXT,
    "relationshipDateId" TEXT,
    "customItemId" TEXT,
    "todoId" TEXT,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRead_userId_itemKey_key" ON "NotificationRead"("userId", "itemKey");
CREATE INDEX "NotificationRead_documentId_idx" ON "NotificationRead"("documentId");
CREATE INDEX "NotificationRead_milestoneId_idx" ON "NotificationRead"("milestoneId");
CREATE INDEX "NotificationRead_relationshipDateId_idx" ON "NotificationRead"("relationshipDateId");
CREATE INDEX "NotificationRead_customItemId_idx" ON "NotificationRead"("customItemId");
CREATE INDEX "NotificationRead_todoId_idx" ON "NotificationRead"("todoId");

-- Deleting the record a marker points at takes the marker with it, so nothing
-- is left that no key could ever match or clean up.
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_relationshipDateId_fkey" FOREIGN KEY ("relationshipDateId") REFERENCES "RelationshipImportantDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_customItemId_fkey" FOREIGN KEY ("customItemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Read on every page render and carrying no index at all. Document already has
-- the matching one, created by 20260910000000_document_archive but never
-- declared in the schema; adding it there closes that drift without a second
-- CREATE here.
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");
