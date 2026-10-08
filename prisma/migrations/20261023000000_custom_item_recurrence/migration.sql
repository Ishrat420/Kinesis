-- KD-055: a custom item's due date can repeat. The rule lives beside
-- CustomItem.dueDate; completing an occurrence advances dueDate in place and
-- records a RECURRENCE_COMPLETED event. Application code
-- (app/(app)/custom-modules/actions.ts) already keeps these consistent; the
-- check constraints below are the database-level backstop.

CREATE TYPE "RecurrenceRule" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'YEARLY', 'EVERY_N_DAYS');

ALTER TABLE "CustomItem" ADD COLUMN "recurrence" "RecurrenceRule";
ALTER TABLE "CustomItem" ADD COLUMN "recurrenceDays" INTEGER;
ALTER TABLE "CustomItem" ADD COLUMN "recurrenceAnchorDay" INTEGER;

-- A rule always has a date to repeat from.
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_recurrence_needs_due_date_check"
  CHECK ("recurrence" IS NULL OR "dueDate" IS NOT NULL);

-- N is present (1-999) exactly when the rule is "every N days". Every
-- branch tests for NULL explicitly: a CHECK passes when it evaluates to
-- NULL, so `NULL BETWEEN 1 AND 999` alone would let a missing N through.
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_recurrence_days_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" = 'EVERY_N_DAYS' AND "recurrenceDays" IS NOT NULL AND "recurrenceDays" BETWEEN 1 AND 999)
    OR (("recurrence" IS NULL OR "recurrence" <> 'EVERY_N_DAYS') AND "recurrenceDays" IS NULL)
  );

-- The anchor day (1-31) is present exactly when the rule is monthly or
-- yearly. Same explicit NULL handling as above.
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_recurrence_anchor_day_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" IN ('MONTHLY', 'YEARLY') AND "recurrenceAnchorDay" IS NOT NULL AND "recurrenceAnchorDay" BETWEEN 1 AND 31)
    OR (("recurrence" IS NULL OR "recurrence" NOT IN ('MONTHLY', 'YEARLY')) AND "recurrenceAnchorDay" IS NULL)
  );

-- Nothing in this migration uses the new value, so adding it is safe in
-- this transaction.
ALTER TYPE "ObjectEventType" ADD VALUE 'RECURRENCE_COMPLETED';
