-- KD-043: DB-level backstop for the length/range limits `lib/validation/
-- field-limits.ts` already enforces at the app layer -- the same numbers
-- (TEXT_LIMIT=255, NOTES_LIMIT=10000, LINK_LIMIT=2000, and the numeric
-- magnitude ceiling 9,999,999,999,999.999999), one CHECK per column rather
-- than a VARCHAR(n) column-type change.
--
-- Every constraint is added NOT VALID: Postgres enforces it on every
-- INSERT/UPDATE from this moment on, but does not scan or validate rows
-- that already exist -- no pre-migration audit of existing data is needed,
-- and nothing existing is touched, truncated, or ever silently rewritten.
-- Run `ALTER TABLE ... VALIDATE CONSTRAINT ...` separately, whenever
-- wanted, to check historical rows without this migration depending on it.
--
-- `ObjectField.value` is one physical column holding many different kinds
-- (TEXT, NUMBER, LINK, ...) at once, so it gets a single blanket ceiling at
-- the loosest tier (NOTES_LIMIT) rather than a per-`type` CASE expression:
-- the DB layer's job here is "stop anything catastrophic," not duplicate
-- the app layer's precise per-kind number.

ALTER TABLE "Document" ADD CONSTRAINT "Document_documentNumber_length" CHECK (length("documentNumber") <= 255) NOT VALID;
ALTER TABLE "Document" ADD CONSTRAINT "Document_country_length" CHECK (length("country") <= 255) NOT VALID;
ALTER TABLE "Document" ADD CONSTRAINT "Document_notes_length" CHECK (length("notes") <= 10000) NOT VALID;
ALTER TABLE "Document" ADD CONSTRAINT "Document_link_length" CHECK (length("link") <= 2000) NOT VALID;

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_note_length" CHECK (length("note") <= 10000) NOT VALID;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_unit_length" CHECK (length("unit") <= 255) NOT VALID;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_targetValue_magnitude" CHECK (abs("targetValue") <= 9999999999999.999999) NOT VALID;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_currentValue_magnitude" CHECK (abs("currentValue") <= 9999999999999.999999) NOT VALID;

ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_value_magnitude" CHECK (abs("value") <= 9999999999999.999999) NOT VALID;

ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_category_length" CHECK (length("category") <= 255) NOT VALID;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_notes_length" CHECK (length("notes") <= 10000) NOT VALID;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_amount_magnitude" CHECK (abs("amount") <= 9999999999999.999999) NOT VALID;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_rate_magnitude" CHECK (abs("rate") <= 9999999999999.999999) NOT VALID;
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_monthlyContribution_magnitude" CHECK (abs("monthlyContribution") <= 9999999999999.999999) NOT VALID;

ALTER TABLE "Person" ADD CONSTRAINT "Person_category_length" CHECK (length("category") <= 255) NOT VALID;
ALTER TABLE "Person" ADD CONSTRAINT "Person_selfNotes_length" CHECK (length("selfNotes") <= 10000) NOT VALID;

ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_type_length" CHECK (length("type") <= 255) NOT VALID;
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_notes_length" CHECK (length("notes") <= 10000) NOT VALID;

ALTER TABLE "RelationshipReflection" ADD CONSTRAINT "RelationshipReflection_text_length" CHECK (length("text") <= 10000) NOT VALID;
ALTER TABLE "ConnectionPractice" ADD CONSTRAINT "ConnectionPractice_cadence_length" CHECK (length("cadence") <= 255) NOT VALID;

ALTER TABLE "CustomModule" ADD CONSTRAINT "CustomModule_description_length" CHECK (length("description") <= 255) NOT VALID;

ALTER TABLE "Todo" ADD CONSTRAINT "Todo_notes_length" CHECK (length("notes") <= 10000) NOT VALID;

ALTER TABLE "ObjectField" ADD CONSTRAINT "ObjectField_value_length" CHECK (length("value") <= 10000) NOT VALID;
