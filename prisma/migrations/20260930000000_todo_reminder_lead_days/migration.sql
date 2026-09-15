-- KD-027: a To-Do gains the same configurable lead time the other three
-- reminder object types already have (milestone, relationship, customItem).
-- Unlike those three, this defaults to 0, not 30 -- a To-Do previously had no
-- advance stage at all (ADR-009: capture must not require a deadline), so a
-- nonzero default would start a deployment's to-dos warning a lead time early
-- the moment this migration runs, purely because the constant already existed
-- for the other three. Zero is additive in the truest sense: no dated to-do's
-- visible behaviour changes until someone opens Settings and asks for one.
ALTER TABLE "UserSettings" ADD COLUMN "todoReminderLeadDays" INTEGER NOT NULL DEFAULT 0;
