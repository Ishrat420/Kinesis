CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- The existing single-user installation owner remains the administrator.
UPDATE "User" SET "role" = 'OWNER';

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "clerkInvitationId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_email_key" ON "UserInvitation"("email");
CREATE UNIQUE INDEX "UserInvitation_clerkInvitationId_key" ON "UserInvitation"("clerkInvitationId");
CREATE INDEX "UserInvitation_revokedAt_acceptedAt_idx" ON "UserInvitation"("revokedAt", "acceptedAt");
