-- KD-051: a milestone's own add/update/delete moments, so its goal's
-- History (and the Kinesis Link peek reading that same stream) can say
-- more than "Updated". Nothing in this migration uses the new values, so
-- adding all three in one statement group is safe in the same transaction.
ALTER TYPE "ObjectEventType" ADD VALUE 'GOAL_MILESTONE_ADDED';
ALTER TYPE "ObjectEventType" ADD VALUE 'GOAL_MILESTONE_UPDATED';
ALTER TYPE "ObjectEventType" ADD VALUE 'GOAL_MILESTONE_DELETED';
