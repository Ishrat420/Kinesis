-- KD-056: a document's expiry date can renew on a schedule, the same rule
-- shape as a to-do's or milestone's repeat (20261024000000_todo_recurrence).
-- Application code (lib/data/documents.ts) keeps these consistent; the check
-- constraints below are the database-level backstop, with the same explicit
-- NULL handling (a CHECK that evaluates to NULL passes).

ALTER TYPE "ObjectEventType" ADD VALUE 'DOCUMENT_RENEWED';

ALTER TABLE "Document" ADD COLUMN "recurrence" "RecurrenceRule";
ALTER TABLE "Document" ADD COLUMN "recurrenceDays" INTEGER;
ALTER TABLE "Document" ADD COLUMN "recurrenceAnchorDay" INTEGER;

-- A rule always has an expiry date to renew from.
ALTER TABLE "Document" ADD CONSTRAINT "Document_recurrence_needs_expiry_date_check"
  CHECK ("recurrence" IS NULL OR "expiryDate" IS NOT NULL);

-- N is present (1-999) exactly when the rule is "every N days".
ALTER TABLE "Document" ADD CONSTRAINT "Document_recurrence_days_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" = 'EVERY_N_DAYS' AND "recurrenceDays" IS NOT NULL AND "recurrenceDays" BETWEEN 1 AND 999)
    OR (("recurrence" IS NULL OR "recurrence" <> 'EVERY_N_DAYS') AND "recurrenceDays" IS NULL)
  );

-- The anchor day (1-31) is present exactly when the rule is monthly or yearly.
ALTER TABLE "Document" ADD CONSTRAINT "Document_recurrence_anchor_day_check"
  CHECK (
    ("recurrence" IS NOT NULL AND "recurrence" IN ('MONTHLY', 'YEARLY') AND "recurrenceAnchorDay" IS NOT NULL AND "recurrenceAnchorDay" BETWEEN 1 AND 31)
    OR (("recurrence" IS NULL OR "recurrence" NOT IN ('MONTHLY', 'YEARLY')) AND "recurrenceAnchorDay" IS NULL)
  );
