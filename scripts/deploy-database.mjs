// Deployment applies migrations, and only migrations.
//
// Kinesis ran on `prisma db push` before it had a migration history, so databases
// created back then carry the schema without any record of how they got it. This
// script gives those databases the one-time baseline they need and then hands over
// to `prisma migrate deploy` for good. Once every environment has been deployed at
// least once, both steps below are permanent no-ops and this file can go back to
// being a plain `prisma migrate deploy`.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

// The last migration whose effects a db push database is guaranteed to already
// have: object identity arrived with a migration history, so any database still
// without one predates it. Everything after this is real work for migrate deploy.
const BASELINE_THROUGH = "20260831010000_typed_object_relationships";

// The first cut of the universal identity migration put a PostgreSQL enum value
// and its first use in one transaction, which cannot work. PostgreSQL rolls a
// failed migration back whole, so nothing of it survives to clean up: the record
// of the failure is all that blocks a retry.
const SUPERSEDED_FAILURES = ["20260901000000_universal_object_identity"];

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaBinary = fileURLToPath(new URL(`../node_modules/.bin/prisma${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));

const runPrisma = (...args) => execFileSync(prismaBinary, args, { cwd: projectRoot, env: process.env, stdio: "inherit" });

async function withDatabase(query) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await query(client);
  } finally {
    await client.end();
  }
}

/** What the database can tell us about how it was built. */
const readDeploymentState = () => withDatabase(async (client) => {
  const { rows: [tables] } = await client.query(`
    SELECT to_regclass('public."User"') IS NOT NULL AS "hasSchema",
           to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasHistoryTable"
  `);
  if (!tables.hasHistoryTable) return { hasSchema: tables.hasSchema, applied: [], failed: [] };
  const { rows } = await client.query(`
    SELECT "migration_name" AS name, "finished_at" IS NULL AS failed
    FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL
  `);
  return {
    hasSchema: tables.hasSchema,
    applied: rows.filter((row) => !row.failed).map((row) => row.name),
    failed: rows.filter((row) => row.failed).map((row) => row.name),
  };
});

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to deploy database migrations.");

const state = await readDeploymentState();

// Record the migrations a db push database demonstrably already has. This only
// ever marks history; it never runs SQL, so a database that has not been through
// db push is left alone and migrate deploy builds it from empty.
if (state.hasSchema && state.applied.length === 0 && state.failed.length === 0) {
  const migrations = readdirSync(new URL("../prisma/migrations", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name <= BASELINE_THROUGH)
    .map((entry) => entry.name)
    .sort();
  console.log(`Baselining ${migrations.length} migrations already present in this db push database.`);
  for (const migration of migrations) runPrisma("migrate", "resolve", "--applied", migration);
}

// Clear the record of a known-superseded failure so its replacement can run.
// Any other failure stays put: it needs a person, not a retry.
for (const migration of state.failed) {
  if (!SUPERSEDED_FAILURES.includes(migration)) continue;
  console.log(`Clearing the superseded failed migration ${migration} so the corrected one can apply.`);
  runPrisma("migrate", "resolve", "--rolled-back", migration);
}

runPrisma("migrate", "deploy");
