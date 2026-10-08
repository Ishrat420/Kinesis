-- KD-056: a goal milestone's due date can repeat, the same rule shape as a
-- to-do's (20261024000000_todo_recurrence). Application code
-- (app/(app)/goals/actions.ts) keeps these consistent; the check
-- constraints below are the database-level backstop, with the same explicit
-- NULL handling (a CHECK that evaluates to NULL passes).

ALTER TABLE "Milestone" ADD COLUMN "recurrence" "RecurrenceRule";
ALTER TABLE "Milestone" ADD COLUMN "recurrenceDays" INTEGER;
ALTER TABLE "Milestone" ADD COLUMN "recurrenceAnchorDay" INTEGER;
ALTER TABLE "Milestone" ADD COLUMN "completedOccurrences" INTEGER NOT NULL DEFAULT 0;

-- A rule always has a date to repeat from.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_recurrence_needs_due_date_check"
  CHECK ("recurrence" IS NULL OR "dueDate" IS NOT NULL);

-- N is present (1-999) exactly when the rule is "every N days".
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_recurrence_days_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" = 'EVERY_N_DAYS' AND "recurrenceDays" IS NOT NULL AND "recurrenceDays" BETWEEN 1 AND 999)
    OR (("recurrence" IS NULL OR "recurrence" <> 'EVERY_N_DAYS') AND "recurrenceDays" IS NULL)
  );

-- The anchor day (1-31) is present exactly when the rule is monthly or yearly.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_recurrence_anchor_day_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" IN ('MONTHLY', 'YEARLY') AND "recurrenceAnchorDay" IS NOT NULL AND "recurrenceAnchorDay" BETWEEN 1 AND 31)
    OR (("recurrence" IS NULL OR "recurrence" NOT IN ('MONTHLY', 'YEARLY')) AND "recurrenceAnchorDay" IS NULL)
  );

-- A milestone with a target value completes itself when the goal reaches
-- it, so it never repeats.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_recurrence_no_value_check"
  CHECK ("recurrence" IS NULL OR "value" IS NULL);

ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_completed_occurrences_check"
  CHECK ("completedOccurrences" >= 0);
