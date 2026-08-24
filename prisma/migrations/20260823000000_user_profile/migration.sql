CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
INSERT INTO "User" ("id", "firstName", "lastName", "preferredName", "email", "updatedAt")
VALUES ('current', 'Ishrat', '', NULL, '', CURRENT_TIMESTAMP);
UPDATE "Document" SET "owner" = 'Ishrat' WHERE "owner" = 'user';
ALTER TABLE "Document" ALTER COLUMN "owner" DROP DEFAULT;
