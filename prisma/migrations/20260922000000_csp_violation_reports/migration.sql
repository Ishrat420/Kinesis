-- CreateTable
CREATE TABLE "CspViolationReport" (
    "id" TEXT NOT NULL,
    "documentUri" TEXT,
    "violatedDirective" TEXT,
    "blockedUri" TEXT,
    "disposition" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CspViolationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CspViolationReport_createdAt_idx" ON "CspViolationReport"("createdAt");
