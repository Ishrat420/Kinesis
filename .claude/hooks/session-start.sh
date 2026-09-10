#!/bin/bash
set -euo pipefail

# Local terminal sessions already have their own persistent Postgres and env
# files set up once, by hand -- this hook exists for Claude Code on the web,
# where the container is rebuilt fresh each session and nothing survives.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Async: a chat-only turn shouldn't wait on a database it may never touch. If a
# turn *does* touch the database before this finishes (a handful of seconds),
# the caller is expected to retry once rather than treat it as a real failure.
echo '{"async": true, "asyncTimeout": 120000}'

cd "$CLAUDE_PROJECT_DIR"

npm install

# npm install's own postinstall generates the client against whatever
# schema.prisma was checked out when it ran. That's correct the vast majority
# of the time, but it silently goes stale the moment schema.prisma changes
# afterward without another install -- a git reset/checkout mid-session, for
# instance -- and db:deploy below runs with --skip-generate, so nothing else
# in this script would catch it. Regenerating explicitly here costs a few
# hundred milliseconds and removes the dependency on install-ordering.
npx prisma generate

DB_ROLE="kinesis"
DB_PASSWORD="kinesis"
DEV_DB="kinesis"
TEST_DB="kinesis_test"
DEV_DATABASE_URL="postgresql://${DB_ROLE}:${DB_PASSWORD}@localhost:5432/${DEV_DB}?schema=public"
TEST_DATABASE_URL="postgresql://${DB_ROLE}:${DB_PASSWORD}@localhost:5432/${TEST_DB}?schema=public"

service postgresql start || true
for _ in $(seq 1 30); do
  pg_isready -h localhost -p 5432 >/dev/null 2>&1 && break
  sleep 1
done

# Idempotent: create the role/databases only if this is a container that
# doesn't already have them baked in.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_ROLE}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_ROLE} LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DEV_DB}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DEV_DB} OWNER ${DB_ROLE};"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${TEST_DB} OWNER ${DB_ROLE};"

# .env/.env.test are gitignored -- write them only if a prior session in this
# same container hasn't already left better ones in place.
[ -f .env ] || printf 'DATABASE_URL="%s"\n' "$DEV_DATABASE_URL" > .env
[ -f .env.test ] || printf 'DATABASE_URL="%s"\nTEST_DATABASE_URL="%s"\n' "$DEV_DATABASE_URL" "$TEST_DATABASE_URL" > .env.test

# db:deploy (not `migrate deploy` directly) because it also records migration
# history a database reached via an old `db push`, which a fresh `kinesis_test`
# won't need but costs nothing extra to go through.
DATABASE_URL="$DEV_DATABASE_URL" npm run db:deploy
DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy
