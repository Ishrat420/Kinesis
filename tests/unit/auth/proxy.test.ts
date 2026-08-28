import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userInvitation: { findUnique: vi.fn() },
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
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
  currentUser: clerk.currentUser,
}));
vi.mock("@/lib/data/prisma", () => ({ prisma: database }));

import proxy from "@/proxy";

const invoke = (path: string) => (proxy as unknown as (auth: typeof clerk.auth, request: Request) => Promise<Response | undefined>)(clerk.auth, new Request(`https://kinesis.test${path}`));

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KINESIS_OWNER_CLERK_USER_ID;
    clerk.auth.mockResolvedValue({ userId: null });
    clerk.currentUser.mockResolvedValue(null);
    database.user.findUnique.mockResolvedValue(null);
    database.userInvitation.findUnique.mockResolvedValue(null);
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

  it("allows an active invited member through", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    clerk.auth.mockResolvedValue({ userId: "user_member" });
    database.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    await expect(invoke("/goals")).resolves.toBeUndefined();
  });
});
