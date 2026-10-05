-- A database that ran on `prisma db push` before Person.selfNotes existed is
-- baselined by scripts/deploy-database.mjs through 20260831010000, which
-- records 20260831000000_person_self_notes as applied without its column
-- ever being added. The post-deploy `db push` reconciliation would add it,
-- but 20261013000000_field_length_limits puts a CHECK on "selfNotes" first
-- and fails ("column does not exist") before reconciliation gets a chance.
-- Adding it here, idempotently, closes that gap; everywhere else it's a no-op.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "selfNotes" TEXT;
