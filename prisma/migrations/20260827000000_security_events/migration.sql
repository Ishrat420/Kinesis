CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
