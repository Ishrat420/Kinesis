-- KD-027 shipped todoReminderLeadDays defaulting to 0 (silent until due,
-- matching a to-do's pre-existing behaviour exactly). Revised almost
-- immediately to 30, matching the other three reminder lead times: a to-do's
-- advance reminder should work like everyone else's out of the box, not need
-- to be found and turned up before it does anything.
--
-- The column default only governs rows inserted from here on -- an existing
-- row already has 0 stored, not "no value falling back to the default" -- so
-- this also bumps every row still sitting at the old default up to the new
-- one. Scoped to exactly that (`= 0`, the only value this column has ever
-- been able to hold since it was introduced one migration ago): nothing here
-- overwrites a deliberate choice, because there has not yet been time for one
-- to exist.
ALTER TABLE "UserSettings" ALTER COLUMN "todoReminderLeadDays" SET DEFAULT 30;
UPDATE "UserSettings" SET "todoReminderLeadDays" = 30 WHERE "todoReminderLeadDays" = 0;
