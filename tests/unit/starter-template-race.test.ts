import { describe, expect, it, vi } from "vitest";
import { ensureStarterTemplate } from "@/lib/data/starter-template";

/**
 * `ensureStarterTemplate` runs unlocked, outside any transaction, on two of
 * `requireKinesisUser`'s branches (the already-mapped-owner ones) -- unlike
 * the true first-provisioning branch, which serializes on an advisory lock.
 * Two overlapping requests for the same not-yet-backfilled owner (two
 * browser tabs, a prefetch racing a navigation) can both pass the
 * `findFirst` check before either commits its `create`; the database's own
 * unique index (Template_one_starter_per_user) then rejects the loser with
 * a P2002 error.
 *
 * A real concurrent-request race isn't reliably reproducible against a real
 * database in a test (two JS promises racing doesn't guarantee the queries
 * themselves overlap), so this drives the exact failure with a mocked
 * client instead: `findFirst` reports nothing found, `create` reports the
 * unique-index violation the real database would raise for the loser of
 * that race.
 */
const fakeClient = (createError: unknown) => ({
  template: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => { throw createError; }),
  },
});

describe("ensureStarterTemplate: losing the create race", () => {
  it("resolves quietly on a unique-constraint violation, since the winner already created the row", async () => {
    const client = fakeClient({ code: "P2002", message: "Unique constraint failed" });

    await expect(ensureStarterTemplate(client as never, "owner-1")).resolves.toBeUndefined();
    expect(client.template.create).toHaveBeenCalledTimes(1);
  });

  it("still rethrows any other error, rather than swallowing every failure", async () => {
    const client = fakeClient(new Error("connection reset"));

    await expect(ensureStarterTemplate(client as never, "owner-1")).rejects.toThrow("connection reset");
  });

  it("still rethrows a differently-coded Prisma error, not just anything with a code", async () => {
    const client = fakeClient({ code: "P2025", message: "Record not found" });

    await expect(ensureStarterTemplate(client as never, "owner-1")).rejects.toMatchObject({ code: "P2025" });
  });
});
