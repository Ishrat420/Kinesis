CREATE TYPE "NotificationType" AS ENUM ('REMINDER_DUE', 'EXPIRED');

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "timeUntilExpiry" TEXT,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentType" TEXT,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_documentId_type_expiryDate_key" ON "Notification"("documentId", "type", "expiryDate");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
