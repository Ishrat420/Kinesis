ALTER TABLE "Milestone" ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "Milestone" SET "completedAt" = CURRENT_TIMESTAMP WHERE "completed" = true;
