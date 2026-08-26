if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required for database-backed integration tests"
  );
}

if (
  process.env.DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    "Refusing to run integration tests because TEST_DATABASE_URL matches DATABASE_URL"
  );
}

// Prisma reads DATABASE_URL when its client module is initialized. Point it at
// the already-validated integration database before any test imports Prisma.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
