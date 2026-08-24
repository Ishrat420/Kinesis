CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "appearance" TEXT NOT NULL DEFAULT 'system',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);
