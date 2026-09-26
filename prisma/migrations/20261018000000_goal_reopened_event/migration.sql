-- A goal moving from any status back to Active gets its own named History
-- moment (GOAL_REOPENED), the counterpart to the existing GOAL_COMPLETED
-- -- previously this wrote a generic STATUS_CHANGED row.
-- Nothing in this migration uses the new value, so adding it is safe
-- in this transaction.
ALTER TYPE "ObjectEventType" ADD VALUE 'GOAL_REOPENED';
