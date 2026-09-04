-- A document had no way out of the reminder cycle. Its `status` column is
-- derived display data that no query ever filters on, so the only exits were
-- clearing the expiry date or deleting the record entirely. This gives a
-- document the same terminal state a custom item already has: archiving it
-- keeps the record and its history but stops every reminder surface from
-- reading it.
ALTER TABLE "Document" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- Archived rows leave the cycle, so the reminder queries all filter on this
-- alongside the owner they already scope to.
CREATE INDEX "Document_userId_archived_idx" ON "Document"("userId", "archived");
