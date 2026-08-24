CREATE TABLE "AttentionDismissal" (
  "id" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttentionDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttentionDismissal_itemKey_key" ON "AttentionDismissal"("itemKey");
