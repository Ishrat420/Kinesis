-- A connection practice's recurrence used to be anchored on `createdAt`, which
-- the relationship map rewrote on every save. The schedule therefore drifted to
-- whatever day the map was last touched. `anchorDate` makes the anchor a stated
-- fact about the practice instead of a side effect of when its row was written.

ALTER TABLE "ConnectionPractice" ADD COLUMN "anchorDate" TIMESTAMP(3);

-- Backfill the anchor from the schedule each practice is running on today.
--
-- `createdAt` is the day these have been recurring from, so it is the anchor for
-- everything except a cadence that named a weekday ("Every Sunday"): there the
-- weekday is the real schedule, so the anchor moves forward to the next such day
-- and the practice keeps landing exactly where it always has. Day-of-week is
-- read in UTC, matching how every reader interprets these timestamps.
UPDATE "ConnectionPractice"
SET "anchorDate" = date_trunc('day', "createdAt") + make_interval(days => (
  (
    CASE
      WHEN lower(coalesce("cadence", '')) LIKE '%sunday%'    THEN 0
      WHEN lower(coalesce("cadence", '')) LIKE '%monday%'    THEN 1
      WHEN lower(coalesce("cadence", '')) LIKE '%tuesday%'   THEN 2
      WHEN lower(coalesce("cadence", '')) LIKE '%wednesday%' THEN 3
      WHEN lower(coalesce("cadence", '')) LIKE '%thursday%'  THEN 4
      WHEN lower(coalesce("cadence", '')) LIKE '%friday%'    THEN 5
      WHEN lower(coalesce("cadence", '')) LIKE '%saturday%'  THEN 6
      ELSE EXTRACT(DOW FROM "createdAt")::int
    END
  ) - EXTRACT(DOW FROM "createdAt")::int + 7
) % 7);

-- Cadence was free text, and anything the recurrence reader did not recognise
-- produced no calendar entries at all -- silently. Fold the phrasings it did
-- understand into the fixed vocabulary the form now offers. Order matters:
-- "every two weeks" contains "week", so fortnightly is claimed before weekly.
--
-- Text that matches nothing is deliberately left as it is rather than guessed
-- at. Inventing a schedule for it would be worse than showing it unrecognised,
-- which is what the practice list now does.
UPDATE "ConnectionPractice"
SET "cadence" = CASE
  WHEN lower("cadence") ~ 'daily|every day' THEN 'Daily'
  WHEN lower("cadence") ~ 'fortnight|every two weeks|every 2 weeks' THEN 'Fortnightly'
  WHEN lower("cadence") ~ 'weekly|every week|sunday|monday|tuesday|wednesday|thursday|friday|saturday' THEN 'Weekly'
  WHEN lower("cadence") ~ 'monthly|every month' THEN 'Monthly'
  WHEN lower("cadence") ~ 'yearly|annually|every year' THEN 'Yearly'
  ELSE "cadence"
END
WHERE "cadence" IS NOT NULL;
