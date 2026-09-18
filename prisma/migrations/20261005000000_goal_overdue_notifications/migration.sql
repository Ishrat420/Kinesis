-- A goal past its target date used to only ever be handled silently:
-- archiveLapsedGoals flips it to Archived on the next page load and nothing
-- says so (KD-028). This adds the missing awareness for a goal still Active
-- past its target date -- Upcoming & Due, Needs Attention and the bell all
-- read the same "status = Active, targetDate < today" condition (see
-- lib/attention/items.ts's goalUpcomingPhase/isOverdueForNeedsAttention),
-- with no lead-up phase: ADR-010's "Other Exceptions" #3 already decided a
-- goal target is self-imposed and never predicts, only states a fact once
-- it's overdue.
--
-- This is a reconciled row like every other notification source, not a
-- one-off event: nothing here writes a permanent "this goal lapsed" record,
-- so there's nothing to protect from the delete pass -- it simply stops
-- matching once the goal's status changes.
ALTER TYPE "NotificationType" ADD VALUE 'GOAL_DUE';

ALTER TABLE "NotificationRead" ADD COLUMN "goalId" TEXT;
ALTER TABLE "NotificationFirstSeen" ADD COLUMN "goalId" TEXT;

CREATE INDEX "NotificationRead_goalId_idx" ON "NotificationRead"("goalId");
CREATE INDEX "NotificationFirstSeen_goalId_idx" ON "NotificationFirstSeen"("goalId");

ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Widen exactly_one_parent (20260925000000_relationship_exactly_one_parent /
-- 20261004000000_notification_first_seen) to include the new source.
ALTER TABLE "NotificationRead" DROP CONSTRAINT "NotificationRead_exactly_one_parent";
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_exactly_one_parent"
CHECK (num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId", "goalId") = 1);

ALTER TABLE "NotificationFirstSeen" DROP CONSTRAINT "NotificationFirstSeen_exactly_one_parent";
ALTER TABLE "NotificationFirstSeen" ADD CONSTRAINT "NotificationFirstSeen_exactly_one_parent"
CHECK (num_nonnulls("documentId", "milestoneId", "relationshipDateId", "customItemId", "todoId", "goalId") = 1);
