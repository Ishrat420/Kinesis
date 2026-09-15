-- Marks the one template `ensureStarterTemplate` seeds for every owner
-- (lib/data/starter-template.ts), independent of its (renameable) `name`, so
-- it can be found and protected from deletion regardless of what the owner
-- has renamed it to. Defaults to false for every existing row -- nothing
-- already in the database is retroactively treated as the starter template.
ALTER TABLE "Template" ADD COLUMN "isStarter" BOOLEAN NOT NULL DEFAULT false;
