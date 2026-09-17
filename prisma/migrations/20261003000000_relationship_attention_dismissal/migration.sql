-- KD-047: Upcoming & Due's Important Dates rows gain a Dismiss action, the
-- same one Documents and Custom Items already have. AttentionDismissal
-- already carries one nullable FK per dismissible kind purely for
-- referential integrity (see the model's own comment) -- this adds the
-- fourth, mirroring the relationshipDateId column NotificationRead already
-- has for the equivalent read-marker relation.
ALTER TABLE "AttentionDismissal" ADD COLUMN "relationshipDateId" TEXT;

CREATE INDEX "AttentionDismissal_relationshipDateId_idx" ON "AttentionDismissal"("relationshipDateId");

ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_relationshipDateId_fkey" FOREIGN KEY ("relationshipDateId") REFERENCES "RelationshipImportantDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The 20260925000000 migration's "exactly one parent" check predates this
-- column, so it must be widened to admit relationshipDateId as the fourth
-- option -- otherwise every relationship dismissal fails it outright.
ALTER TABLE "AttentionDismissal" DROP CONSTRAINT "AttentionDismissal_exactly_one_parent";
ALTER TABLE "AttentionDismissal" ADD CONSTRAINT "AttentionDismissal_exactly_one_parent" CHECK (num_nonnulls("documentId", "customItemId", "todoId", "relationshipDateId") = 1);
