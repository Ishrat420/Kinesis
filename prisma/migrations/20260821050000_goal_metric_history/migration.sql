-- Preserve every measurable-goal update so its pace and projection can be calculated.
CREATE TABLE "GoalMetricSnapshot" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalMetricSnapshot_goalId_recordedAt_idx" ON "GoalMetricSnapshot"("goalId", "recordedAt");

ALTER TABLE "GoalMetricSnapshot" ADD CONSTRAINT "GoalMetricSnapshot_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
