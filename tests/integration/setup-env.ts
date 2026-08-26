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