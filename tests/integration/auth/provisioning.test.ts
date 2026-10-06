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

  // ADR-014: any signed-in identity gets its own account. Who can sign in is
  // decided by Clerk's Restricted sign-up mode; KINESIS_OWNER_CLERK_USER_ID
  // only marks the admin, and plays no part in getting in.
  it("provisions an account for a signed-in identity that isn't the admin", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "clerk_owner";
    clerk.auth.mockResolvedValue({ userId: "clerk_invited" });
    clerk.currentUser.mockResolvedValue(owner("clerk_invited", "Invited"));

    const provisioned = await requireKinesisUser();

    expect(provisioned.clerkUserId).toBe("clerk_invited");
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("gives each signed-in person their own separate account", async () => {
    process.env.KINESIS_OWNER_CLERK_USER_ID = "clerk_owner";
    const accounts = [];
    for (const id of ["clerk_owner", "clerk_invited_one", "clerk_invited_two"]) {
      clerk.auth.mockResolvedValue({ userId: id });
      clerk.currentUser.mockResolvedValue(owner(id));
      accounts.push(await requireKinesisUser());
    }

    expect(new Set(accounts.map(({ id }) => id)).size).toBe(3);
    expect(accounts.map(({ clerkUserId }) => clerkUserId)).toEqual(["clerk_owner", "clerk_invited_one", "clerk_invited_two"]);
  });

  // No owner adoption: a Clerk identity Kinesis hasn't seen always gets a
  // fresh, empty account, whatever else is in the database. Moving an account
  // to a new identity is scripts/rebind-owner.mjs's job (rebind-owner.test.ts).
  it("never claims an account with no Clerk identity bound: the new identity gets its own", async () => {
    const unbound = await prisma.user.create({
      data: {
        firstName: "Legacy", lastName: "Owner", email: "legacy@example.com",
        objects: { create: { id: "unbound-goal-object", type: "GOAL", name: "Not yours" } },
        goals: { create: { id: "unbound-goal", objectId: "unbound-goal-object", name: "Not yours" } },
      },
    });
    authenticate("clerk_owner");

    const provisioned = await requireKinesisUser();

    expect(provisioned.id).not.toBe(unbound.id);
    expect(provisioned.clerkUserId).toBe("clerk_owner");
    await expect(prisma.user.findUniqueOrThrow({ where: { id: unbound.id } })).resolves.toMatchObject({ clerkUserId: null });
    await expect(prisma.goal.count({ where: { userId: provisioned.id } })).resolves.toBe(0);
  });

  it("never hands another identity's account, or its data, to a new identity", async () => {
    const existing = await prisma.user.create({
      data: {
        clerkUserId: "clerk_previous",
        firstName: "Old",
        lastName: "Owner",
        email: "old@example.com",
        objects: { create: { id: "previous-goal-object", type: "GOAL", name: "Keep me" } },
        goals: { create: { id: "previous-goal", objectId: "previous-goal-object", name: "Keep me" } },
      },
    });
    authenticate("clerk_replacement", "New");

    const replacement = await requireKinesisUser();

    expect(replacement.id).not.toBe(existing.id);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({ clerkUserId: "clerk_previous" });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: "previous-goal" } })).resolves.toMatchObject({ userId: existing.id });
    await expect(prisma.goal.count({ where: { userId: replacement.id } })).resolves.toBe(0);
  });

  it("provisions a new identity alongside existing accounts instead of refusing", async () => {
    await prisma.user.createMany({
      data: [
        { firstName: "One", lastName: "Owner", email: "one@example.com" },
        { clerkUserId: "clerk_two", firstName: "Two", lastName: "Owner", email: "two@example.com" },
      ],
    });
    authenticate("clerk_owner");

    const provisioned = await requireKinesisUser();

    expect(provisioned.clerkUserId).toBe("clerk_owner");
    await expect(prisma.user.count()).resolves.toBe(3);
  });

  it("finds the same account again on a later sign-in", async () => {
    authenticate("clerk_owner");
    const first = await requireKinesisUser();
    const again = await requireKinesisUser();
    expect(again.id).toBe(first.id);
    await expect(prisma.user.count()).resolves.toBe(1);
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
