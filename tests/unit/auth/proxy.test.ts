import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ auth: vi.fn(), middlewareOptions: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown, options: unknown) => {
    clerk.middlewareOptions = options;
    return handler;
  },
  createRouteMatcher: (patterns: string[]) => (request: Request) => {
    const pathname = new URL(request.url).pathname;
    return patterns.some((pattern) => {
      if (pattern === "/sign-in(.*)") return pathname.startsWith("/sign-in");
      if (pattern === "/api/notifications/evaluate") return pathname === pattern;
      if (pattern === "/api(.*)") return pathname.startsWith("/api");
      if (pattern === "/trpc(.*)") return pathname.startsWith("/trpc");
      return false;
    });
  },
}));

import proxy, { config } from "@/proxy";

const invoke = (path: string) => proxy(clerk.auth, new Request(`https://kinesis.test${path}`));

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KINESIS_OWNER_CLERK_USER_ID;
    clerk.auth.mockResolvedValue({ userId: null });
  });

  it("enables and matches Clerk Frontend API proxy requests", () => {
    expect(clerk.middlewareOptions).toEqual({ frontendApiProxy: { enabled: true } });
    expect(config.matcher).toContain("/__clerk/(.*)");
  });

  it("redirects an unauthenticated page request to sign-in", async () => {
    const response = await invoke("/documents");
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://kinesis.test/sign-in");
  });

  it("returns 401 rather than a redirect for an unauthenticated API request", async () => {
    const response = await invoke("/api/settings/export");
    expect(response?.status).toBe(401);
  });

  it.each(["/sign-in", "/sign-in/factor-one", "/api/notifications/evaluate"])("allows public exception %s through", async (path) => {
    await expect(invoke(path)).resolves.toBeUndefined();
    expect(clerk.auth).not.toHaveBeenCalled();
  });

  it("fails closed when owner configuration is missing", async () => {
    clerk.auth.mockResolvedValue({ userId: "user_owner" });
    const response = await invoke("/goals");
    expect(response?.status).toBe(503);
  });

  it("rejects a signed-in user other than the configured owner", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    clerk.auth.mockResolvedValue({ userId: "user_intruder" });
    const response = await invoke("/goals");
    expect(response?.status).toBe(403);
  });

  it("allows only the configured owner through", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    clerk.auth.mockResolvedValue({ userId: "user_owner" });
    await expect(invoke("/goals")).resolves.toBeUndefined();
  });
});
