/*
  Warnings:

  - You are about to drop the column `link` on the `CustomItem` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `CustomItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CustomItem" DROP COLUMN "link",
DROP COLUMN "notes";
