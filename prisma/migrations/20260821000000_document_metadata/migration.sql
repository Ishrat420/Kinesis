ALTER TABLE "Document"
ADD COLUMN "notes" TEXT,
ADD COLUMN "expiryDateLabel" TEXT NOT NULL DEFAULT 'Expiry date',
ADD COLUMN "issueDateLabel" TEXT NOT NULL DEFAULT 'Issue date',
ADD COLUMN "documentNumberLabel" TEXT NOT NULL DEFAULT 'Document number',
ADD COLUMN "countryLabel" TEXT NOT NULL DEFAULT 'Country',
ADD COLUMN "notesLabel" TEXT NOT NULL DEFAULT 'Notes';

UPDATE "Document" SET "owner" = 'user' WHERE "owner" IS NULL;
ALTER TABLE "Document" ALTER COLUMN "owner" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "owner" SET DEFAULT 'user';

CREATE TABLE "DocumentField" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DocumentField_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentField_documentId_position_idx" ON "DocumentField"("documentId", "position");
ALTER TABLE "DocumentField" ADD CONSTRAINT "DocumentField_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
