-- Which day "today" is, for the owner.
--
-- Every reader derived it from `startOfUtcDay(new Date())`, which is the UTC
-- day rather than theirs. On UTC+10 that is yesterday until mid-morning, so
-- overdue badges, countdowns, the calendar's today marker and the notification
-- engine were all a day behind for the first third of every day.
--
-- Stored dates are untouched: they remain calendar days at UTC midnight, and
-- so does the day this resolves to. Only the question changes.
ALTER TABLE "UserSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Australia/Sydney';
