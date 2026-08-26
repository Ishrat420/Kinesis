import { afterEach, describe, expect, it, vi } from "vitest";

const evaluateNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/notifications", () => ({ evaluateNotifications }));

import { GET, POST } from "@/app/api/notifications/evaluate/route";

describe("notification cron authentication", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    const response = await GET(new Request("https://kinesis.test/api/notifications/evaluate"));
    expect(response.status).toBe(503);
    expect(evaluateNotifications).not.toHaveBeenCalled();
  });

  it.each([GET, POST])("returns 401 for a missing or incorrect bearer secret", async (handler) => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await handler(new Request("https://kinesis.test/api/notifications/evaluate", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
    expect(evaluateNotifications).not.toHaveBeenCalled();
  });

  it("allows the cron endpoint with the configured bearer secret", async () => {
    process.env.CRON_SECRET = "correct-secret";
    evaluateNotifications.mockResolvedValue({ evaluated: 3 });
    const response = await GET(new Request("https://kinesis.test/api/notifications/evaluate", {
      headers: { authorization: "Bearer correct-secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ evaluated: 3 });
  });
});
