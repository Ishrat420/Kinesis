-- The "Reminder" field on a custom item is renamed to what it functionally
-- already was: a due date. Needs Attention already treated it as one
-- (overdue once it's in the past); this migration lets the notification
-- engine, Upcoming & Due, and the Calendar treat it the same way, via a
-- third and independent lead-time setting (customItemReminderLeadDays,
-- default 30 days) alongside milestone's and relationship's.
ALTER TABLE "CustomItem" RENAME COLUMN "reminder" TO "dueDate";

ALTER TABLE "UserSettings" ADD COLUMN "customItemReminderLeadDays" INTEGER NOT NULL DEFAULT 30;

ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_ITEM_DUE';

ALTER TABLE "Notification" ADD COLUMN "customItemId" TEXT;

CREATE UNIQUE INDEX "Notification_userId_customItemId_type_expiryDate_key"
ON "Notification"("userId", "customItemId", "type", "expiryDate");

CREATE INDEX "Notification_customItemId_idx" ON "Notification"("customItemId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customItemId_fkey"
FOREIGN KEY ("customItemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
