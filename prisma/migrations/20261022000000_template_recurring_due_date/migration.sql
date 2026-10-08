-- KD-055: Recurring Due Date as a distinct template field, the repeating
-- sibling of KD-038's Due Date. Application code (lib/data/templates.ts's
-- updateTemplate) already refuses a save that breaks any of these rules;
-- these constraints are the database-level backstop for the same rules.

ALTER TABLE "TemplateField" ADD COLUMN "isRecurringDueDate" BOOLEAN NOT NULL DEFAULT false;

-- A recurring due-date field is always a DATE field.
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_recurringDueDate_is_date_check" CHECK (NOT "isRecurringDueDate" OR "type" = 'DATE');

-- One row is never both kinds at once.
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_one_due_date_kind_check" CHECK (NOT ("isDueDate" AND "isRecurringDueDate"));

-- At most one due-date-type field per template, of either kind. Replaces
-- KD-038's isDueDate-only index, which this one covers.
DROP INDEX "TemplateField_templateId_isDueDate_key";
CREATE UNIQUE INDEX "TemplateField_templateId_dueDateKind_key" ON "TemplateField"("templateId") WHERE "isDueDate" OR "isRecurringDueDate";
