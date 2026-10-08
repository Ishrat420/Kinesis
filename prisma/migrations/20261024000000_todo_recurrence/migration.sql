-- KD-056: a to-do's due date can repeat, the same rule shape as a custom
-- item's (KD-055, 20261023000000_custom_item_recurrence). Application code
-- (lib/data/todos.ts) keeps these consistent; the check constraints below
-- are the database-level backstop, with the same explicit NULL handling
-- (a CHECK that evaluates to NULL passes).

ALTER TABLE "Todo" ADD COLUMN "recurrence" "RecurrenceRule";
ALTER TABLE "Todo" ADD COLUMN "recurrenceDays" INTEGER;
ALTER TABLE "Todo" ADD COLUMN "recurrenceAnchorDay" INTEGER;

-- A rule always has a date to repeat from.
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurrence_needs_due_date_check"
  CHECK ("recurrence" IS NULL OR "dueDate" IS NOT NULL);

-- N is present (1-999) exactly when the rule is "every N days".
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurrence_days_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" = 'EVERY_N_DAYS' AND "recurrenceDays" IS NOT NULL AND "recurrenceDays" BETWEEN 1 AND 999)
    OR (("recurrence" IS NULL OR "recurrence" <> 'EVERY_N_DAYS') AND "recurrenceDays" IS NULL)
  );

-- The anchor day (1-31) is present exactly when the rule is monthly or yearly.
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurrence_anchor_day_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" IN ('MONTHLY', 'YEARLY') AND "recurrenceAnchorDay" IS NOT NULL AND "recurrenceAnchorDay" BETWEEN 1 AND 31)
    OR (("recurrence" IS NULL OR "recurrence" NOT IN ('MONTHLY', 'YEARLY')) AND "recurrenceAnchorDay" IS NULL)
  );

-- A repeating to-do is never stored as DONE: completing it moves the date.
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurrence_never_done_check"
  CHECK ("recurrence" IS NULL OR "status" <> 'DONE');
