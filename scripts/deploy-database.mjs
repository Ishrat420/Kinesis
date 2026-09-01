// Deployment applies migrations, and only migrations.
//
// Kinesis ran on `prisma db push` before it had a migration history, so a database
// can be *ahead* of what its history records: the schema is there, the rows saying
// how it got there are not. `migrate deploy` would then try to build something that
// already exists and fail. This script records the history such a database has
// demonstrably already earned, and then hands over to `migrate deploy` for good.
//
// It never runs schema SQL of its own. Once every environment has been deployed
// once, every step below is a no-op and this file can go back to being a plain
// `prisma migrate deploy`.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

// Each entry: if the database carries this evidence, every migration up to and
// including `through` is already in effect and only needs recording. Ordered from
// least to most advanced; the furthest match wins.
const BASELINES = [
  { through: "20260831010000_typed_object_relationships", evidence: (state) => state.hasUserTable },
  { through: "20260901000000_universal_object_identity", evidence: (state) => state.hasObjectTable },
];

// The first cut of the universal identity migration put a PostgreSQL enum value
// and its first use in one transaction, which cannot work. PostgreSQL rolls a
// failed migration back whole, so nothing of it survives to clean up: the record
// of the failure is all that blocks the corrected migration from applying.
const SUPERSEDED_FAILURES = ["20260901000000_universal_object_identity"];

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaBinary = fileURLToPath(new URL(`../node_modules/.bin/prisma${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));

const runPrisma = (...args) => execFileSync(prismaBinary, args, { cwd: projectRoot, env: process.env, stdio: "inherit" });
const readPrisma = (...args) => execFileSync(prismaBinary, args, { cwd: projectRoot, env: process.env, encoding: "utf8" });

/** The SQL still needed to turn this database into the one the schema describes. */
function schemaDrift() {
  const diff = readPrisma("migrate", "diff", "--from-url", process.env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.prisma", "--script");
  return diff.split("\n").filter((line) => line.trim() && !line.startsWith("--")).join("\n");
}

const migrationNames = () => readdirSync(new URL("../prisma/migrations", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function readDeploymentState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: [tables] } = await client.query(`
      SELECT to_regclass('public."User"') IS NOT NULL AS "hasUserTable",
             to_regclass('public."Object"') IS NOT NULL AS "hasObjectTable",
             to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasHistoryTable"
    `);
    if (!tables.hasHistoryTable) return { ...tables, applied: [], failed: [] };
    const { rows } = await client.query(`
      SELECT "migration_name" AS name, "finished_at" IS NULL AS failed
      FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL
    `);
    return {
      ...tables,
      applied: rows.filter((row) => !row.failed).map((row) => row.name),
      failed: rows.filter((row) => row.failed).map((row) => row.name),
    };
  } finally {
    await client.end();
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to deploy database migrations.");

const state = await readDeploymentState();
const baselineThrough = BASELINES.filter(({ evidence }) => evidence(state)).map(({ through }) => through).pop();

// Record what the database already has. A failed row for one of these describes an
// attempt that PostgreSQL rolled back whole, so it is only in the way: clear it
// first, then record the migration as the applied fact the schema shows it to be.
const unrecorded = baselineThrough
  ? migrationNames().filter((name) => name <= baselineThrough && !state.applied.includes(name))
  : [];
if (unrecorded.length) {
  console.log(`Recording ${unrecorded.length} migrations this database already has: it predates its own history.`);
  for (const migration of unrecorded) {
    if (state.failed.includes(migration)) runPrisma("migrate", "resolve", "--rolled-back", migration);
    runPrisma("migrate", "resolve", "--applied", migration);
  }
}

// Clear a known-superseded failure so its replacement can run. Any other failure
// stays put: it needs a person, not a retry.
for (const migration of state.failed) {
  if (unrecorded.includes(migration) || !SUPERSEDED_FAILURES.includes(migration)) continue;
  console.log(`Clearing the superseded failed migration ${migration} so the corrected one can apply.`);
  runPrisma("migrate", "resolve", "--rolled-back", migration);
}

runPrisma("migrate", "deploy");

// Applying every migration is not the same as arriving at the schema. Baselining
// asserts that a migration already ran, and a db push database can be behind the
// point it is baselined to, leaving columns that no migration will ever add now.
// That gap used to be hidden by a blanket `db push` on every deploy; it surfaces
// here instead, as the last thing between a green build and a 500.
let drift = schemaDrift();
if (drift) {
  console.log(`The migration history did not fully describe this database. Reconciling:\n${drift}`);
  // No --accept-data-loss: this may only add what is missing. Anything that would
  // discard data stops the deploy for a person to look at.
  runPrisma("db", "push", "--skip-generate");
  drift = schemaDrift();
}
if (drift) throw new Error(`The database still does not match the schema after deploying:\n${drift}`);
console.log("Database matches the schema.");
