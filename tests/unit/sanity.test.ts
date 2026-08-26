import { describe, expect, it } from "vitest";

describe("Kinesis test environment", () => {
  it("runs with Node environment", () => {
    expect(typeof process).toBe("object");
    expect(process.versions.node).toBeDefined();
  });

  it("is running in test mode", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});