import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { prisma } from "@/lib/data/prisma";

/**
 * scripts/rebind-owner.mjs -- the deliberate replacement for the owner
 * adoption requireKinesisUser no longer does: an operator moves an account
 * to a new Clerk identity, explicitly, and nothing else ever can.
 */

function rebind(...args: string[]) {
  const result = spawnSync(process.execPath, ["scripts/rebind-owner.mjs", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

async function account(clerkUserId: string | null, tag: string, withData = true) {
  return prisma.user.create({
    data: {
      clerkUserId, firstName: tag, lastName: "Owner", email: `${tag}@example.test`,
      ...(withData ? {
        objects: { create: { id: `${tag}-goal-object`, type: "GOAL", name: `${tag} goal` } },
        goals: { create: { id: `${tag}-goal`, objectId: `${tag}-goal-object`, name: `${tag} goal` } },
      } : {}),
    },
  });
}

const boundTo = (clerkUserId: string) => prisma.user.findUnique({ where: { clerkUserId } });

describe.sequential("owner:rebind", () => {
  beforeEach(async () => { await prisma.user.deleteMany(); });
  afterAll(async () => { await prisma.user.deleteMany(); await prisma.$disconnect(); });

  it("changes nothing without --yes", async () => {
    const old = await account("user_old", "old");

    const result = rebind("--from", "user_old", "--to", "user_new");

    expect(result.status).toBe(0);
    expect(result.output).toContain("Dry run");
    await expect(boundTo("user_old")).resolves.toMatchObject({ id: old.id });
    await expect(boundTo("user_new")).resolves.toBeNull();
  });

  it("moves the account, with all its data, to the new identity and records it", async () => {
    const old = await account("user_old", "old");

    expect(rebind("--from", "user_old", "--to", "user_new", "--yes").status).toBe(0);

    await expect(boundTo("user_new")).resolves.toMatchObject({ id: old.id });
    await expect(boundTo("user_old")).resolves.toBeNull();
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: "old-goal" } })).resolves.toMatchObject({ userId: old.id });
    await expect(prisma.securityEvent.count({ where: { userId: old.id, event: "OWNER_REBOUND" } })).resolves.toBe(1);
  });

  it("replaces the empty account the new identity got by signing in first", async () => {
    const old = await account("user_old", "old");
    const fresh = await account("user_new", "fresh", false);
    await prisma.template.create({ data: { id: "fresh-starter", name: "Starter", userId: fresh.id, isStarter: true } });

    expect(rebind("--from", "user_old", "--to", "user_new", "--yes").status).toBe(0);

    await expect(boundTo("user_new")).resolves.toMatchObject({ id: old.id });
    await expect(prisma.user.findUnique({ where: { id: fresh.id } })).resolves.toBeNull();
  });

  it("refuses to overwrite a new identity's account that already has data", async () => {
    const old = await account("user_old", "old");
    const busy = await account("user_new", "busy");

    const result = rebind("--from", "user_old", "--to", "user_new", "--yes");

    expect(result.status).toBe(1);
    expect(result.output).toContain("already has an account with data");
    await expect(boundTo("user_old")).resolves.toMatchObject({ id: old.id });
    await expect(boundTo("user_new")).resolves.toMatchObject({ id: busy.id });
  });

  it("claims the one account with no identity bound, only when asked to by name", async () => {
    const legacy = await account(null, "legacy");

    expect(rebind("--from", "unbound", "--to", "user_new", "--yes").status).toBe(0);

    await expect(boundTo("user_new")).resolves.toMatchObject({ id: legacy.id });
  });

  it("refuses an unbound claim when it is ambiguous, and an identity that isn't bound to anything", async () => {
    await account(null, "one");
    await account(null, "two");

    const ambiguous = rebind("--from", "unbound", "--to", "user_new", "--yes");
    const missing = rebind("--from", "user_nobody", "--to", "user_new", "--yes");

    expect(ambiguous.status).toBe(1);
    expect(ambiguous.output).toContain("found 2");
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("no account is bound to user_nobody");
    await expect(boundTo("user_new")).resolves.toBeNull();
  });
});
