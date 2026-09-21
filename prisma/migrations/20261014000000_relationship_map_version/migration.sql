-- CreateTable
CREATE TABLE "RelationshipMapVersion" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RelationshipMapVersion_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "RelationshipMapVersion" ADD CONSTRAINT "RelationshipMapVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
