-- KD-059: a document's file kept in the owner's own Google Drive. Kinesis
-- stores only the Drive file's ID and what it knew of the file when attached.

ALTER TABLE "Document" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "Document" ADD COLUMN "driveFileName" TEXT;
ALTER TABLE "Document" ADD COLUMN "driveMimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "driveWebViewLink" TEXT;

ALTER TABLE "Document" ADD CONSTRAINT "Document_drive_file_all_or_none_check"
  CHECK (
    ("driveFileId" IS NULL AND "driveFileName" IS NULL AND "driveMimeType" IS NULL AND "driveWebViewLink" IS NULL)
    OR ("driveFileId" IS NOT NULL AND "driveFileName" IS NOT NULL AND "driveMimeType" IS NOT NULL AND "driveWebViewLink" IS NOT NULL)
  );

ALTER TABLE "UserSettings" ADD COLUMN "googleDriveEnabled" BOOLEAN NOT NULL DEFAULT true;
