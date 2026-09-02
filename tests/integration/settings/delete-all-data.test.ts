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

async function tableCounts(): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
    ORDER BY tablename
  `;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [row] = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${tablename}"`,
    );
    counts[tablename] = row.count;
  }
  return counts;
}

/** Populates every table a user can own, so nothing is missed by omission. */
async function seedEverything(userId: string, tag: string) {
  const object = (suffix: string, type: "DOCUMENT" | "GOAL" | "FINANCE_ITEM" | "PERSON" | "CUSTOM_ITEM", name: string) =>
    prisma.object.create({ data: { id: `${tag}-object-${suffix}`, type, name, userId } });

  await prisma.userSettings.create({ data: { userId } });
  await prisma.documentType.create({ data: { id: `${tag}-doctype`, name: "Passport", userId } });
  await prisma.goalUnit.create({ data: { id: `${tag}-unit`, name: "kg", userId } });
  await prisma.attentionDismissal.create({ data: { id: `${tag}-dismissal`, itemKey: "k", userId } });
  await prisma.activityEvent.create({
    data: { id: `${tag}-activity`, action: "Added", moduleName: "Goals", objectName: "x", icon: "goals", userId },
  });
  await prisma.securityEvent.create({ data: { id: `${tag}-security`, event: "SIGNED_IN", userId } });

  await object("doc", "DOCUMENT", "Doc");
  await prisma.document.create({
    data: {
      id: `${tag}-doc`, name: "Doc", type: "Passport", status: "Active", owner: "Owner", userId,
      objectId: `${tag}-object-doc`,
      customFields: { create: { id: `${tag}-docfield`, label: "L", value: "V" } },
    },
  });

  await object("goal", "GOAL", "Goal one");
  await prisma.goal.create({
    data: {
      id: `${tag}-goal`, name: "Goal one", userId, objectId: `${tag}-object-goal`,
      milestones: { create: { id: `${tag}-milestone`, name: "M" } },
      metricHistory: { create: { id: `${tag}-snapshot`, value: 1 } },
    },
  });
  await object("goal2", "GOAL", "Goal two");
  await prisma.goal.create({ data: { id: `${tag}-goal2`, name: "Goal two", userId, objectId: `${tag}-object-goal2` } });
  await prisma.objectRelationship.create({
    data: {
      id: `${tag}-objrel`, userId, type: "SUPPORTS",
      sourceObjectId: `${tag}-object-goal`, targetObjectId: `${tag}-object-goal2`,
      pairKey: `${tag}-object-goal:${tag}-object-goal2`,
    },
  });

  // One notification hanging off a document, one owned only by the user.
  await prisma.notification.createMany({
    data: [
      { id: `${tag}-notif-doc`, type: "REMINDER_DUE", documentId: `${tag}-doc`, documentName: "Doc", message: "m", actionUrl: "/", userId },
      { id: `${tag}-notif-bare`, type: "REMINDER_DUE", documentName: "Doc", message: "m", actionUrl: "/", userId },
    ],
  });

  await object("finance", "FINANCE_ITEM", "Salary");
  await prisma.financeItem.create({
    data: { id: `${tag}-finance`, kind: "asset", name: "Salary", amount: 1, userId, objectId: `${tag}-object-finance` },
  });

  await object("person", "PERSON", "Me");
  await prisma.person.create({
    data: {
      id: `${tag}-person`, name: "Me", isSelf: true, userId, objectId: `${tag}-object-person`,
      selfPractices: { create: { id: `${tag}-selfpractice`, title: "Walk" } },
      selfReflections: { create: { id: `${tag}-selfreflection`, text: "t", reflectedAt: new Date() } },
      selfImportantDates: { create: { id: `${tag}-selfdate`, label: "Birthday", date: new Date() } },
    },
  });
  await object("person2", "PERSON", "Them");
  await prisma.person.create({ data: { id: `${tag}-person2`, name: "Them", userId, objectId: `${tag}-object-person2` } });
  await prisma.relationship.create({
    data: {
      id: `${tag}-relationship`, userId, firstPersonId: `${tag}-person`, secondPersonId: `${tag}-person2`,
      practices: { create: { id: `${tag}-practice`, title: "Call" } },
      reflections: { create: { id: `${tag}-reflection`, text: "t", reflectedAt: new Date() } },
      importantDates: { create: { id: `${tag}-date`, label: "Anniversary", date: new Date() } },
      linkedGoals: { create: { goalId: `${tag}-goal` } },
    },
  });

  await prisma.customModule.create({
    data: { id: `${tag}-module`, name: "Books", normalizedName: `${tag} books`, icon: "star", color: "#111111", userId },
  });
  await object("item", "CUSTOM_ITEM", "Item");
  await prisma.customItem.create({
    data: {
      id: `${tag}-item`, name: "Item", moduleId: `${tag}-module`, objectId: `${tag}-object-item`,
      fields: { create: { id: `${tag}-itemfield`, label: "L", value: "V" } },
    },
  });
}

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
