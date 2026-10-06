// Moves a Kinesis account to a different Clerk identity -- the owner-rotation
// step that used to happen implicitly on sign-in, and now only happens when an
// operator asks for it (requireKinesisUser never hands an existing account to
// a new identity; see lib/auth.ts).
//
//   npm run owner:rebind -- --from <old Clerk user id> --to <new Clerk user id>          # dry run
//   npm run owner:rebind -- --from <old Clerk user id> --to <new Clerk user id> --yes    # apply
//
// `--from unbound` selects the one account with no Clerk identity bound at all
// (a database that predates Clerk sign-in), refusing if there isn't exactly one.
//
// If the new identity already signed in, it got a fresh account of its own.
// That account is removed first, but only while it is still empty (no
// records, custom modules or non-starter templates); anything else is refused
// rather than merged.
//
// Reads DATABASE_URL from the environment, like scripts/deploy-database.mjs.
import pg from "pg";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const from = option("from");
const to = option("to");
const apply = args.includes("--yes");

class Refusal extends Error {}
const fail = (message) => { throw new Refusal(message); };
const refuse = (message) => {
  console.error(`owner:rebind: ${message}`);
  process.exit(1);
};

if (!process.env.DATABASE_URL) refuse("DATABASE_URL is required.");
if (!from || !to) refuse("usage: npm run owner:rebind -- --from <old Clerk user id | unbound> --to <new Clerk user id> [--yes]");
if (from === to) refuse("--from and --to are the same identity; there is nothing to move.");
if (!/^user_\w+$/.test(to)) refuse(`--to must be a Clerk user id (user_...), got "${to}".`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  const sources = from === "unbound"
    ? (await client.query(`SELECT "id", "email" FROM "User" WHERE "clerkUserId" IS NULL FOR UPDATE`)).rows
    : (await client.query(`SELECT "id", "email" FROM "User" WHERE "clerkUserId" = $1 FOR UPDATE`, [from])).rows;
  if (sources.length !== 1) {
    fail(from === "unbound"
      ? `expected exactly one account with no Clerk identity, found ${sources.length}.`
      : `no account is bound to ${from}.`);
  }
  const [source] = sources;

  const [target] = (await client.query(`SELECT "id", "email" FROM "User" WHERE "clerkUserId" = $1 FOR UPDATE`, [to])).rows;
  if (target) {
    const { rows: [usage] } = await client.query(`
      SELECT
        (SELECT count(*) FROM "Object" WHERE "userId" = $1)::int AS objects,
        (SELECT count(*) FROM "CustomModule" WHERE "userId" = $1)::int AS modules,
        (SELECT count(*) FROM "Template" WHERE "userId" = $1 AND NOT "isStarter")::int AS templates
    `, [target.id]);
    if (usage.objects || usage.modules || usage.templates) {
      fail(`${to} already has an account with data in it (${usage.objects} records, ${usage.modules} custom modules, ${usage.templates} templates). Refusing to merge or overwrite it.`);
    }
  }

  console.log(`Move account ${source.id} (${source.email}) from ${from} to ${to}.`);
  if (target) console.log(`First remove the empty account ${target.id} (${target.email}) that ${to} got when it signed in.`);

  if (!apply) {
    await client.query("ROLLBACK");
    console.log("Dry run: nothing changed. Re-run with --yes to apply.");
  } else {
    if (target) await client.query(`DELETE FROM "User" WHERE "id" = $1`, [target.id]);
    await client.query(`UPDATE "User" SET "clerkUserId" = $1, "updatedAt" = now() WHERE "id" = $2`, [to, source.id]);
    await client.query(`INSERT INTO "SecurityEvent" ("id", "event", "userId") VALUES (gen_random_uuid()::text, 'OWNER_REBOUND', $1)`, [source.id]);
    await client.query("COMMIT");
    console.log("Done. Sign in as the new identity to confirm.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  if (!(error instanceof Refusal)) throw error;
  console.error(`owner:rebind: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
