-- KD-026: a document can opt out of its expiry reminder. NULL means "No
-- reminders"; every existing document keeps the lead time it already has.
ALTER TABLE "Document" ALTER COLUMN "prompt" DROP NOT NULL;
