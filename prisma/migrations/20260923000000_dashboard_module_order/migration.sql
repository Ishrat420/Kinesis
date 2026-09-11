-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "dashboardModuleOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
