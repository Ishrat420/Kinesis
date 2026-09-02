-- Relationship important dates (birthdays, anniversaries, and one-off events)
-- previously had no reminder of their own: the notification engine never saw
-- them, and the dashboard's "Upcoming & Due" widget used a hardcoded 31-day
-- lookahead unrelated to any setting. This adds a second, independent lead
-- time (see UserSettings.relationshipReminderLeadDays, defaulting to 30 days)
-- and lets a Notification originate from an important date the same way one
-- already can from a Document or a Milestone.
ALTER TABLE "UserSettings" ADD COLUMN "relationshipReminderLeadDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Notification" ADD COLUMN "relationshipDateId" TEXT;

CREATE UNIQUE INDEX "Notification_userId_relationshipDateId_type_expiryDate_key"
ON "Notification"("userId", "relationshipDateId", "type", "expiryDate");

CREATE INDEX "Notification_relationshipDateId_idx" ON "Notification"("relationshipDateId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relationshipDateId_fkey"
FOREIGN KEY ("relationshipDateId") REFERENCES "RelationshipImportantDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
