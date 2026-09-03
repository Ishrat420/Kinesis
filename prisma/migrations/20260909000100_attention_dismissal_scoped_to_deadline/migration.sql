-- A dismissal used to be keyed on the record alone, which made it permanent in
-- the strongest sense: dismiss an expired document, renew it, let it expire
-- again, and it stayed hidden. It is now keyed on the record *and* the deadline
-- it was dismissed at ("<kind>:<id>:<yyyy-mm-dd>"), so editing the date makes
-- the stored key stop matching and the item returns to Needs Attention on its
-- own. Nothing expires on a timer; the date edit is the whole signal.
--
-- The nullable columns below are for referential integrity, not lookup: they
-- let a deleted record take its dismissals with it instead of orphaning rows
-- that nothing could ever match or clean up.
ALTER TABLE "AttentionDismissal" ADD COLUMN "documentId" TEXT;
ALTER TABLE "AttentionDismissal" ADD COLUMN "customItemId" TEXT;
ALTER TABLE "AttentionDismissal" ADD COLUMN "todoId" TEXT;

-- Backfill: rewrite each existing key with the record's current date, so a
-- dismissal the person has not since revisited keeps meaning what they meant.
-- Dates are stored at UTC midnight, so the day can be read off directly.
UPDATE "AttentionDismissal" AS d
SET "documentId" = t."id",
    "itemKey" = 'document:' || t."id" || ':' || to_char(t."expiryDate", 'YYYY-MM-DD')
FROM "Document" AS t
WHERE d."itemKey" = 'document:' || t."id" AND t."expiryDate" IS NOT NULL;

UPDATE "AttentionDismissal" AS d
SET "customItemId" = t."id",
    "itemKey" = 'custom:' || t."id" || ':' || to_char(t."dueDate", 'YYYY-MM-DD')
FROM "CustomItem" AS t
WHERE d."itemKey" = 'custom:' || t."id" AND t."dueDate" IS NOT NULL;

UPDATE "AttentionDismissal" AS d
SET "todoId" = t."id",
    "itemKey" = 'todo:' || t."id" || ':' || to_char(t."dueDate", 'YYYY-MM-DD')
FROM "Todo" AS t
WHERE d."itemKey" = 'todo:' || t."id" AND t."dueDate" IS NOT NULL;

-- Whatever is left could never be matched again: a deleted record, a record
-- whose date has since been cleared, or a milestone -- which KD-017 replaced
-- with "Mark complete" and "Reschedule", and which is no longer dismissible.
DELETE FROM "AttentionDismissal"
WHERE "documentId" IS NULL AND "customItemId" IS NULL AND "todoId" IS NULL;

CREATE INDEX "AttentionDismissal_documentId_idx" ON "AttentionDismissal"("documentId");
CREATE INDEX "AttentionDismissal_customItemId_idx" ON "AttentionDismissal"("customItemId");
CREATE INDEX "AttentionDismissal_todoId_idx" ON "AttentionDismissal"("todoId");

ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_customItemId_fkey"
FOREIGN KEY ("customItemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_todoId_fkey"
FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
