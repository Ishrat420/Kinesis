-- A Document entering its reminder window gets its own named History
-- moment (DOCUMENT_EXPIRING_SOON) instead of a generic STATUS_CHANGED
-- row, the same way GOAL_COMPLETED already gets its own type instead of
-- a generic "Finished" status line. Nothing in this migration uses the
-- new value, so adding it here is safe in this transaction.
ALTER TYPE "ObjectEventType" ADD VALUE 'DOCUMENT_EXPIRING_SOON';
