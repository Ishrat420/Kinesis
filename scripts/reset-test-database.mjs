// Resets the dedicated integration-test database by replaying the real Prisma
// migration history (`prisma migrate reset`), not `prisma db push`.
//
// `db push` only synchronises the schema Prisma knows about; it never runs a
// migration's raw SQL. Migration-only objects such as the
// kinesis_sync_object_name trigger (20260902000000_object_capability_layer)
// therefore never existed on a `db push`-built test database, so integration
// tests could pass against behaviour production does not actually have.
//
// This is destructive (it drops and rebuilds the target database), so every
// guard below is a hard refusal, never a warning: this script must not be
// able to run against a Preview or Production database.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// Captured before any dotenv load below, so a stray DATABASE_URL inside
// .env.test itself can never contaminate the comparison this guards with.
const ambientDatabaseUrl = process.env.DATABASE_URL;

// Only .env.test may supply TEST_DATABASE_URL. Falling back to whatever is
// already in the shell would let a Preview/Production DATABASE_URL exported
// by an unrelated command leak in as the reset target.
const { parsed: testEnv } = config({ path: `${projectRoot}/.env.test`, processEnv: {} });
const testDatabaseUrl = testEnv?.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required in .env.test to reset the integration test database.");
}

// Vercel sets VERCEL_ENV to exactly "production" or "preview" in those
// environments. This script has no legitimate reason to run in either.
if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
  throw new Error(`Refusing to reset the test database: VERCEL_ENV is "${process.env.VERCEL_ENV}".`);
}

// The same check tests/integration/setup-env.ts makes before any test runs:
// a "test" database that is actually the real one is not a test database.
// Compare against every place DATABASE_URL could legitimately come from, not
// just the ambient shell, so a value sitting only in .env or .env.local still
// trips this guard.
const { parsed: baseEnv } = config({ path: `${projectRoot}/.env`, processEnv: {} });
const { parsed: localEnv } = config({ path: `${projectRoot}/.env.local`, processEnv: {} });
const candidateDatabaseUrls = [ambientDatabaseUrl, baseEnv?.DATABASE_URL, localEnv?.DATABASE_URL].filter(Boolean);
if (candidateDatabaseUrls.includes(testDatabaseUrl)) {
  throw new Error("Refusing to reset: TEST_DATABASE_URL matches DATABASE_URL. This must be a dedicated test database.");
}

const prismaBinary = fileURLToPath(new URL(`../node_modules/.bin/prisma${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));

console.log("Resetting the integration test database from the migration history...");
execFileSync(prismaBinary, ["migrate", "reset", "--force", "--skip-seed"], {
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  stdio: "inherit",
});
console.log("Test database now matches the applied migration history.");
