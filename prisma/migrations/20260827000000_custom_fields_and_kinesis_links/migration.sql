CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'LINK', 'KINESIS_LINK');
CREATE TYPE "KinesisObjectType" AS ENUM ('DOCUMENT', 'CUSTOM_ITEM');
ALTER TABLE "DocumentField" ADD COLUMN "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT', ADD COLUMN "targetType" "KinesisObjectType", ADD COLUMN "targetId" TEXT;
ALTER TABLE "CustomItemField" ADD COLUMN "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT', ADD COLUMN "targetType" "KinesisObjectType", ADD COLUMN "targetId" TEXT;
CREATE INDEX "DocumentField_targetType_targetId_idx" ON "DocumentField"("targetType", "targetId");
CREATE INDEX "CustomItemField_targetType_targetId_idx" ON "CustomItemField"("targetType", "targetId");
