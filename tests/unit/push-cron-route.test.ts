import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runDailyPush: vi.fn() }));

vi.mock("@/lib/data/push", () => ({ runDailyPush: mocks.runDailyPush }));

import { GET } from "@/app/api/cron/push-notifications/route";

const call = (authorization?: string) =>
  GET(new Request("https://kinesis.example.test/api/cron/push-notifications", { headers: authorization ? { authorization } : {} }));

/**
 * proxy.ts lets /api/cron past Clerk, so CRON_SECRET is the only thing
 * standing between this route and anyone who finds it.
 */
describe("the daily push cron route", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    mocks.runDailyPush.mockResolvedValue({ configured: true, users: 1, pushed: 2, removedDevices: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs for Vercel Cron's bearer token", async () => {
    const response = await call("Bearer the-secret");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: true, users: 1, pushed: 2, removedDevices: 0 });
  });

  it("refuses a missing or wrong token without running", async () => {
    for (const authorization of [undefined, "Bearer wrong", "the-secret", "Bearer the-secret-and-more"]) {
      expect((await call(authorization)).status).toBe(401);
    }
    expect(mocks.runDailyPush).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured, rather than running open", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(mocks.runDailyPush).not.toHaveBeenCalled();
  });

  it("reports when push isn't configured", async () => {
    mocks.runDailyPush.mockResolvedValue({ configured: false, users: 0, pushed: 0, removedDevices: 0 });
    expect((await call("Bearer the-secret")).status).toBe(503);
  });
});
