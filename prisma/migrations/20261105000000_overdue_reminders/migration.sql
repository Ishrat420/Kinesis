-- KD-058: the overdue reminder push. On by default, every 3 days; the
-- interval is 1-30, checked in the settings action and backstopped here.

ALTER TABLE "UserSettings" ADD COLUMN "overdueRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "overdueReminderIntervalDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "UserSettings" ADD COLUMN "overdueReminderLastSentOn" TIMESTAMP(3);

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_overdue_reminder_interval_check"
  CHECK ("overdueReminderIntervalDays" BETWEEN 1 AND 30);
