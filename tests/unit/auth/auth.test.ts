import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    userInvitation: { findUnique: vi.fn(), update: vi.fn() },
    document: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
  reverificationError: vi.fn((config) => ({ clerk_error: { metadata: { reverification: config } } })),
  reverificationErrorResponse: vi.fn(() => new Response(null, { status: 403 })),
}));
vi.mock("@/lib/data/prisma", () => ({ prisma: mocks.prisma }));

const clerkUser = (id = "user_owner") => ({
  id,
  firstName: "Kira",
  lastName: "Owner",
  primaryEmailAddress: { emailAddress: "kira@example.com" },
});

describe("requireKinesisUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.KINESIS_OWNER_CLERK_USER_ID;
    mocks.auth.mockResolvedValue({ userId: "user_owner", has: vi.fn().mockReturnValue(true) });
    mocks.currentUser.mockResolvedValue(clerkUser());
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.userInvitation.findUnique.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation((callback: (tx: object) => Promise<unknown>) => callback({
      $executeRawUnsafe: vi.fn(),
      user: { findUnique: mocks.prisma.user.findUnique },
      userInvitation: mocks.prisma.userInvitation,
    }));
  });

  it("requires a first-factor verification no more than ten minutes old", async () => {
    const has = vi.fn().mockReturnValue(false);
    mocks.auth.mockResolvedValue({ userId: "user_owner", has });
    vi.resetModules();
    const { requireRecentVerification } = await import("@/lib/auth");

    const result = await requireRecentVerification();

    expect(has).toHaveBeenCalledWith({ reverification: { level: "first_factor", afterMinutes: 10 } });
    expect(result).toMatchObject({ clerk_error: { metadata: { reverification: { level: "first_factor", afterMinutes: 10 } } } });
  });

  async function loadSubject() {
    vi.resetModules();
    return (await import("@/lib/auth")).requireKinesisUser;
  }

  it("fails closed when the owner identity is not configured", async () => {
    const requireKinesisUser = await loadSubject();

    await expect(requireKinesisUser()).rejects.toThrow("owner authentication is not configured");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an authenticated Clerk user who is not the configured owner", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    mocks.auth.mockResolvedValue({ userId: "user_intruder" });
    mocks.currentUser.mockResolvedValue(clerkUser("user_intruder"));
    const requireKinesisUser = await loadSubject();

    await expect(requireKinesisUser()).rejects.toThrow("Unauthorized");
    expect(mocks.prisma.userInvitation.findUnique).toHaveBeenCalledWith({ where: { email: "kira@example.com" } });
  });

  it("rejects expired or inconsistent Clerk sessions", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    mocks.auth.mockResolvedValue({ userId: null });
    const requireKinesisUser = await loadSubject();

    await expect(requireKinesisUser()).rejects.toThrow("Unauthenticated");
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it("loads only the local user mapped to the configured Clerk owner", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    const owner = {
      id: "local-owner",
      clerkUserId: "user_owner",
      firstName: "Kira",
      lastName: "Owner",
      preferredName: null,
      email: "kira@example.com",
      role: "OWNER",
      status: "ACTIVE",
    };
    mocks.prisma.user.findUnique.mockResolvedValue(owner);
    const requireKinesisUser = await loadSubject();

    await expect(requireKinesisUser()).resolves.toBe(owner);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { clerkUserId: "user_owner" } });
  });

  it("serializes concurrent first-owner claims and returns the one generated owner", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "user_owner";
    const owner = { id: "generated-owner", firstName: "Kira", lastName: "Owner", email: "kira@example.com", clerkUserId: "user_owner" };
    let provisioned: typeof owner | null = null;
    let queue = Promise.resolve();
    mocks.prisma.$transaction.mockImplementation((callback: (tx: object) => Promise<unknown>) => {
      const result = queue.then(() => callback({
        $executeRawUnsafe: vi.fn(),
        user: {
          findUnique: vi.fn(async () => provisioned),
          findMany: vi.fn(async () => []),
          create: vi.fn(async () => (provisioned = owner)),
          update: vi.fn(),
        },
        userInvitation: { findUnique: vi.fn(), update: vi.fn() },
        document: { updateMany: vi.fn() },
      }));
      queue = result.then(() => undefined);
      return result;
    });
    const firstSubject = await loadSubject();
    const secondSubject = await loadSubject();

    const [first, second] = await Promise.all([firstSubject(), secondSubject()]);

    expect(first).toBe(owner);
    expect(second).toBe(owner);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
