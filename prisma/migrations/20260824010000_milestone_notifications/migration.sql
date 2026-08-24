ALTER TYPE "NotificationType" ADD VALUE 'MILESTONE_DUE';

ALTER TABLE "Notification"
ALTER COLUMN "documentId" DROP NOT NULL,
ALTER COLUMN "expiryDate" DROP NOT NULL,
ADD COLUMN "milestoneId" TEXT;

CREATE UNIQUE INDEX "Notification_milestoneId_type_expiryDate_key"
ON "Notification"("milestoneId", "type", "expiryDate");

CREATE INDEX "Notification_milestoneId_idx" ON "Notification"("milestoneId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
