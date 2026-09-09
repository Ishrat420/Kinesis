-- KD-035 Phase 2: a module can start new items from a template, and an
-- object that does keeps a permanent pointer to it. Two different columns
-- for two different questions -- see the schema doc comments on
-- CustomModule.templateId (forward-looking, SetNull) and Object.templateId
-- (permanent, the single gate on Template deletion, Restrict).

ALTER TABLE "CustomModule" ADD COLUMN "templateId" TEXT;
ALTER TABLE "Object" ADD COLUMN "templateId" TEXT;
ALTER TABLE "ObjectField" ADD COLUMN "templateFieldId" TEXT;

CREATE INDEX "CustomModule_templateId_idx" ON "CustomModule"("templateId");
CREATE INDEX "Object_templateId_idx" ON "Object"("templateId");
CREATE INDEX "ObjectField_templateFieldId_idx" ON "ObjectField"("templateFieldId");

ALTER TABLE "CustomModule" ADD CONSTRAINT "CustomModule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Object" ADD CONSTRAINT "Object_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ObjectField" ADD CONSTRAINT "ObjectField_templateFieldId_fkey" FOREIGN KEY ("templateFieldId") REFERENCES "TemplateField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
