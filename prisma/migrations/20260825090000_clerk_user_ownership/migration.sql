-- Bind the single Kinesis owner to Clerk and scope all top-level data to that owner.
INSERT INTO "User" ("id", "firstName", "lastName", "email", "createdAt", "updatedAt")
VALUES ('current', 'Kinesis', 'Owner', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN "clerkUserId" TEXT;
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

ALTER TABLE "UserSettings" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "FinanceItem" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "Document" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "DocumentType" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "Goal" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "Person" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "Relationship" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "GoalUnit" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "CustomModule" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "AttentionDismissal" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';
ALTER TABLE "ActivityEvent" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'current';

DROP INDEX IF EXISTS "DocumentType_name_key";
DROP INDEX IF EXISTS "GoalUnit_name_key";
DROP INDEX IF EXISTS "CustomModule_normalizedName_key";
DROP INDEX IF EXISTS "AttentionDismissal_itemKey_key";
DROP INDEX IF EXISTS "Notification_documentId_type_expiryDate_key";
DROP INDEX IF EXISTS "Notification_milestoneId_type_expiryDate_key";
DROP INDEX IF EXISTS "FinanceItem_kind_name_idx";
DROP INDEX IF EXISTS "ActivityEvent_createdAt_idx";

CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
CREATE UNIQUE INDEX "DocumentType_userId_name_key" ON "DocumentType"("userId", "name");
CREATE UNIQUE INDEX "GoalUnit_userId_name_key" ON "GoalUnit"("userId", "name");
CREATE UNIQUE INDEX "CustomModule_userId_normalizedName_key" ON "CustomModule"("userId", "normalizedName");
CREATE UNIQUE INDEX "AttentionDismissal_userId_itemKey_key" ON "AttentionDismissal"("userId", "itemKey");
CREATE UNIQUE INDEX "Notification_userId_documentId_type_expiryDate_key" ON "Notification"("userId", "documentId", "type", "expiryDate");
CREATE UNIQUE INDEX "Notification_userId_milestoneId_type_expiryDate_key" ON "Notification"("userId", "milestoneId", "type", "expiryDate");
CREATE UNIQUE INDEX "Relationship_userId_firstPersonId_secondPersonId_key" ON "Relationship"("userId", "firstPersonId", "secondPersonId");
CREATE INDEX "FinanceItem_userId_kind_name_idx" ON "FinanceItem"("userId", "kind", "name");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "ActivityEvent_userId_createdAt_idx" ON "ActivityEvent"("userId", "createdAt");

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalUnit" ADD CONSTRAINT "GoalUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomModule" ADD CONSTRAINT "CustomModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSettings" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "FinanceItem" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "DocumentType" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "Goal" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "Person" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "Relationship" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "GoalUnit" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "CustomModule" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "AttentionDismissal" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "ActivityEvent" ALTER COLUMN "userId" DROP DEFAULT;
