-- KD-053: Web Push for bell notifications.
--
-- NotificationPushed records which notifications have already been sent as a
-- push, keyed on the same itemKey as NotificationRead, so the daily run sends
-- each one once. Same shape as NotificationRead/NotificationFirstSeen: one
-- nullable FK per notification source, purely for referential integrity.
--
-- WebPushSubscription is one device that has turned push on.

-- CreateTable
CREATE TABLE "NotificationPushed" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "documentId" TEXT,
    "milestoneId" TEXT,
    "relationshipDateId" TEXT,
    "customItemId" TEXT,
    "todoId" TEXT,
    "goalId" TEXT,
    "userId" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPushed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPushed_documentId_idx" ON "NotificationPushed"("documentId");

-- CreateIndex
CREATE INDEX "NotificationPushed_milestoneId_idx" ON "NotificationPushed"("milestoneId");

-- CreateIndex
CREATE INDEX "NotificationPushed_relationshipDateId_idx" ON "NotificationPushed"("relationshipDateId");

-- CreateIndex
CREATE INDEX "NotificationPushed_customItemId_idx" ON "NotificationPushed"("customItemId");

-- CreateIndex
CREATE INDEX "NotificationPushed_todoId_idx" ON "NotificationPushed"("todoId");

-- CreateIndex
CREATE INDEX "NotificationPushed_goalId_idx" ON "NotificationPushed"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPushed_userId_itemKey_key" ON "NotificationPushed"("userId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_relationshipDateId_fkey" FOREIGN KEY ("relationshipDateId") REFERENCES "RelationshipImportantDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_customItemId_fkey" FOREIGN KEY ("customItemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Mirrors NotificationRead_exactly_one_parent / NotificationFirstSeen_exactly_one_parent:
-- exactly one source FK is ever set on a given row.
ALTER TABLE "NotificationPushed" ADD CONSTRAINT "NotificationPushed_exactly_one_parent" CHECK (num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId", "goalId") = 1);
