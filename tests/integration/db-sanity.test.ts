import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const client = new Client({
  connectionString,
});

describe("Integration test database", () => {
  it("has a dedicated test database configured", () => {
    expect(process.env.TEST_DATABASE_URL).toBeDefined();
    expect(process.env.TEST_DATABASE_URL).not.toBe("");
  });

  it("points Prisma at the dedicated test database", () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  it("can actually connect to PostgreSQL", async () => {
    await client.connect();

    const result = await client.query("SELECT 1 AS value");

    expect(result.rows[0].value).toBe(1);
  });

  it("reports which database it connected to", async () => {
    const result = await client.query(
      "SELECT current_database() AS name"
    );

    expect(result.rows[0].name).toBeTruthy();

    console.log("Connected test database:", result.rows[0].name);
  });
});

afterAll(async () => {
  await client.end();
});
