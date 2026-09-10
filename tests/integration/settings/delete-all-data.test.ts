import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  requireRecentVerification: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireKinesisUser: mocks.requireKinesisUser,
  requireRecentVerification: mocks.requireRecentVerification,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { prisma } from "@/lib/data/prisma";
import { deleteAllDataAction } from "@/app/(app)/settings/actions";
import { DELETE_ALL_CONFIRMATION } from "@/app/(app)/settings/constants";
import { seedEverything, tableCounts } from "./seed-everything";

/**
 * Delete-all removes Object-backed records through one root and the remaining
 * user-owned tables explicitly. The sweep below reads the table list out of
 * PostgreSQL rather than naming it, so a table added later without a matching
 * delete fails here instead of quietly surviving the deletion.
 */

const leaver = "delete-all-leaver";
const stayer = "delete-all-stayer";

/** Rows about the account itself, which delete-all is not meant to remove. */
const KEPT_TABLES = ["User", "SecurityEvent"];

describe.sequential("deleting all data", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireRecentVerification.mockResolvedValue(true);
    mocks.requireKinesisUser.mockResolvedValue({ id: leaver });
    await prisma.user.deleteMany({ where: { id: { in: [leaver, stayer] } } });
    await prisma.user.createMany({
      data: [
        { id: leaver, firstName: "Leaving", lastName: "Owner", email: "leaver@example.test" },
        { id: stayer, firstName: "Staying", lastName: "Owner", email: "stayer@example.test" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [leaver, stayer] } } });
    await prisma.$disconnect();
  });

  it("seeds every table the sweep will check, so the proof is not vacuous", async () => {
    await seedEverything(leaver, "l");

    const counts = await tableCounts();
    const empty = Object.entries(counts).filter(([, count]) => count === 0).map(([table]) => table);

    expect(empty).toEqual([]);
  });

  it("leaves no user-owned row behind in any table", async () => {
    await seedEverything(leaver, "l");

    await expect(deleteAllDataAction(DELETE_ALL_CONFIRMATION)).resolves.toEqual({ success: true });

    const counts = await tableCounts();
    const survivors = Object.entries(counts)
      .filter(([table, count]) => count > 0 && !KEPT_TABLES.includes(table))
      .map(([table, count]) => `${table} (${count})`);

    expect(survivors).toEqual([]);
  });

  it("keeps the account and records the deletion in its audit trail", async () => {
    await seedEverything(leaver, "l");

    await deleteAllDataAction(DELETE_ALL_CONFIRMATION);

    await expect(prisma.user.findUnique({ where: { id: leaver } })).resolves.toMatchObject({ id: leaver });
    await expect(
      prisma.securityEvent.findMany({ where: { userId: leaver }, select: { event: true }, orderBy: { createdAt: "asc" } }),
    ).resolves.toEqual([{ event: "SIGNED_IN" }, { event: "ALL_DATA_DELETED" }]);
  });

  it("touches nothing belonging to another account", async () => {
    await seedEverything(leaver, "l");
    await seedEverything(stayer, "s");
    const before = await tableCounts();

    await deleteAllDataAction(DELETE_ALL_CONFIRMATION);

    const after = await tableCounts();
    // Every table the stayer seeded still holds their rows, and only theirs.
    for (const [table, count] of Object.entries(after)) {
      if (KEPT_TABLES.includes(table)) continue;
      expect({ table, count }).toEqual({ table, count: before[table] / 2 });
    }
  });

  it("refuses without the confirmation phrase and deletes nothing", async () => {
    await seedEverything(leaver, "l");
    const before = await tableCounts();

    await expect(deleteAllDataAction("delete my stuff")).resolves.toEqual({
      error: "Enter the confirmation phrase exactly as shown.",
    });

    await expect(tableCounts()).resolves.toEqual(before);
  });
});
