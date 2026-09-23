-- Unchecking a completed milestone gets its own named History moment
-- (GOAL_MILESTONE_REOPENED), the counterpart to the existing
-- GOAL_MILESTONE_COMPLETED -- previously this wrote nothing at all.
-- Nothing in this migration uses the new value, so adding it is safe
-- in this transaction.
ALTER TYPE "ObjectEventType" ADD VALUE 'GOAL_MILESTONE_REOPENED';
