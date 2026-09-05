import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@clerk/nextjs/server", () => clerk);

import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

const owner = (id: string, firstName = "Kira") => ({
  id,
  firstName,
  lastName: "Owner",
  primaryEmailAddress: { emailAddress: `${firstName.toLowerCase()}@example.com` },
});

function authenticate(id: string, firstName?: string) {
  process.env.KINESIS_OWNER_CLERK_USER_ID = id;
  clerk.auth.mockResolvedValue({ userId: id });
  clerk.currentUser.mockResolvedValue(owner(id, firstName));
}

describe.sequential("database-backed owner provisioning", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("allows only the configured identity to provision a fresh instance", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "clerk_owner";
    clerk.auth.mockResolvedValue({ userId: "clerk_intruder" });
    clerk.currentUser.mockResolvedValue(owner("clerk_intruder"));

    await expect(requireKinesisUser()).rejects.toThrow("Unauthorized");
    await expect(prisma.user.count()).resolves.toBe(0);

    authenticate("clerk_owner");
    const provisioned = await requireKinesisUser();

    expect(provisioned.clerkUserId).toBe("clerk_owner");
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("binds a migrated unprovisioned owner without changing its generated ID", async () => {
    const migrated = await prisma.user.create({
      data: { firstName: "Legacy", lastName: "Owner", email: "legacy@example.com" },
    });
    authenticate("clerk_owner");

    const provisioned = await requireKinesisUser();

    expect(provisioned).toMatchObject({ id: migrated.id, clerkUserId: "clerk_owner" });
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("rotates the Clerk owner binding in place and preserves owned data", async () => {
    const existing = await prisma.user.create({
      data: {
        clerkUserId: "clerk_deleted",
        firstName: "Old",
        lastName: "Owner",
        email: "old@example.com",
        objects: { create: { id: "rotation-goal-object", type: "GOAL", name: "Keep me" } },
        goals: { create: { id: "rotation-goal", objectId: "rotation-goal-object", name: "Keep me" } },
      },
    });
    authenticate("clerk_replacement", "New");

    const rotated = await requireKinesisUser();

    expect(rotated).toMatchObject({ id: existing.id, clerkUserId: "clerk_replacement" });
    await expect(prisma.goal.findUnique({ where: { id: "rotation-goal" } })).resolves.toMatchObject({
      userId: existing.id,
      name: "Keep me",
    });
  });

  it("fails closed when a migrated database has ambiguous owners", async () => {
    await prisma.user.createMany({
      data: [
        { firstName: "One", lastName: "Owner", email: "one@example.com" },
        { firstName: "Two", lastName: "Owner", email: "two@example.com" },
      ],
    });
    authenticate("clerk_owner");

    await expect(requireKinesisUser()).rejects.toThrow("contains multiple users");
    await expect(prisma.user.count()).resolves.toBe(2);
    await expect(prisma.user.count({ where: { clerkUserId: { not: null } } })).resolves.toBe(0);
  });

  it("returns one local owner for real concurrent first requests", async () => {
    authenticate("clerk_owner");

    const results = await Promise.all(
      Array.from({ length: 6 }, () => requireKinesisUser()),
    );

    expect(new Set(results.map(({ id }) => id)).size).toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
  });
});
