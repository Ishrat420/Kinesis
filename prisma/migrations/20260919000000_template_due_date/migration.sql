-- KD-038 / ADR-011: Due Date as a distinct template field. Application code
-- (lib/data/templates.ts's updateTemplate) already refuses a save that
-- creates a second one or converts a field into or out of one; these two
-- constraints are the database-level backstop for the same two rules.

ALTER TABLE "TemplateField" ADD COLUMN "isDueDate" BOOLEAN NOT NULL DEFAULT false;

-- At most one due-date field per template.
CREATE UNIQUE INDEX "TemplateField_templateId_isDueDate_key" ON "TemplateField"("templateId") WHERE "isDueDate" = true;

-- A due-date field is always a DATE field.
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_dueDate_is_date_check" CHECK (NOT "isDueDate" OR "type" = 'DATE');
