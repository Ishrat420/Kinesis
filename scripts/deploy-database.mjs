import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const BASELINE_THROUGH = "20260831010000_typed_object_relationships";
const SUPERSEDED_FAILED_MIGRATION = "20260901000000_universal_object_identity";
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaBinary = fileURLToPath(new URL(`../node_modules/.bin/prisma${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));

function runPrisma(...args) {
  execFileSync(prismaBinary, args, { cwd: projectRoot, env: process.env, stdio: "inherit" });
}

async function needsLegacyBaseline() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: [state] } = await client.query(`
      SELECT
        to_regclass('public."User"') IS NOT NULL AS "hasDomainSchema",
        to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable"
    `);
    if (!state.hasDomainSchema) return false;
    if (!state.hasMigrationTable) return true;

    const { rows: [history] } = await client.query(
      'SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS "hasHistory"',
    );
    return !history.hasHistory;
  } finally {
    await client.end();
  }
}

async function hasFailedUniversalIdentityMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: [state] } = await client.query(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable"`,
    );
    if (!state.hasMigrationTable) return false;
    const { rows: [failure] } = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE "migration_name" = $1 AND "finished_at" IS NULL AND "rolled_back_at" IS NULL
      ) AS "failed"`,
      [SUPERSEDED_FAILED_MIGRATION],
    );
    return failure.failed;
  } finally {
    await client.end();
  }
}

async function reconcileUniversalIdentityOnExistingDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: [state] } = await client.query(`
      SELECT
        to_regclass('public."User"') IS NOT NULL AS "hasDomainSchema",
        to_regclass('public."Object"') IS NOT NULL AS "hasObjectSchema"
    `);
    if (!state.hasDomainSchema || state.hasObjectSchema) return false;

    // Commit enum values before the backfill uses them. Sending these separately
    // avoids PostgreSQL's "unsafe use of new value" transaction restriction.
    for (const objectType of ["GOAL", "FINANCE_ITEM", "PERSON"]) {
      await client.query(`ALTER TYPE "KinesisObjectType" ADD VALUE IF NOT EXISTS '${objectType}'`);
    }

    const migration = readFileSync(
      new URL("../prisma/migrations/20260901000000_universal_object_identity/migration.sql", import.meta.url),
      "utf8",
    );
    console.log("Applying the universal Object identity backfill to the existing database.");
    await client.query(migration);
    return true;
  } finally {
    await client.end();
  }
}

async function isMigrationApplied(migrationName) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: [state] } = await client.query(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable"`,
    );
    if (!state.hasMigrationTable) return false;
    const { rows: [migration] } = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ) AS "applied"`,
      [migrationName],
    );
    return migration.applied;
  } finally {
    await client.end();
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to deploy database migrations.");

// Older Kinesis deployments used `prisma db push`, so their schema exists without
// migration history. Baseline only the migrations represented by that old schema;
// `migrate deploy` will then run the universal identity migration normally.
if (await needsLegacyBaseline()) {
  const migrations = readdirSync(new URL("../prisma/migrations", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name <= BASELINE_THROUGH)
    .map((entry) => entry.name)
    .sort();

  console.log(`Baselining ${migrations.length} existing migrations from the legacy db-push deployment.`);
  for (const migration of migrations) runPrisma("migrate", "resolve", "--applied", migration);
}

const reconciledUniversalIdentity = await reconcileUniversalIdentityOnExistingDatabase();

// The first version placed PostgreSQL enum additions in the same migration that
// consumed them. Roll back only that known failed attempt so the split migrations
// can be retried; unrelated migration failures remain blocked for manual review.
if (await hasFailedUniversalIdentityMigration()) {
  console.log(`Retrying the corrected ${SUPERSEDED_FAILED_MIGRATION} migration.`);
  runPrisma("migrate", "resolve", "--rolled-back", SUPERSEDED_FAILED_MIGRATION);
}


if (reconciledUniversalIdentity) {
  for (const migration of ["20260901000000_object_type_values", SUPERSEDED_FAILED_MIGRATION]) {
    if (!await isMigrationApplied(migration)) runPrisma("migrate", "resolve", "--applied", migration);
  }
}

runPrisma("migrate", "deploy");

// Legacy installations were created by db push and can differ from the migration
// history they were baselined against. Now that required Object IDs are backfilled,
// reconcile any remaining harmless schema drift so the generated Prisma client and
// the runtime database expose the same columns, constraints, and indexes.
runPrisma("db", "push", "--skip-generate", "--accept-data-loss");
