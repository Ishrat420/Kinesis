CREATE TABLE "Goal" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "targetDate" TIMESTAMP(3), "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Active', "targetValue" DOUBLE PRECISION,
  "currentValue" DOUBLE PRECISION, "unit" TEXT,
  "showMilestoneProgress" BOOLEAN NOT NULL DEFAULT true,
  "showTargetProgress" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Milestone" (
  "id" TEXT NOT NULL, "goalId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "value" DOUBLE PRECISION, "completed" BOOLEAN NOT NULL DEFAULT false,
  "autoCompleted" BOOLEAN NOT NULL DEFAULT false, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GoalUnit" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalUnit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoalUnit_name_key" ON "GoalUnit"("name");
CREATE INDEX "Milestone_goalId_position_idx" ON "Milestone"("goalId", "position");
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
