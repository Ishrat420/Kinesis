CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");
