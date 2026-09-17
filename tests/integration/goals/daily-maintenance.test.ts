import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/data/prisma";
import { runDailyMaintenance } from "@/lib/notifications/engine";

/**
 * runDailyMaintenance is the actual cron entrypoint -- and had no test at
 * all, unit or integration, anywhere. tests/unit/notifications-bell-gate.test.ts
 * mocks it away entirely (it only needs to exist there for module-load
 * reasons), and archiveLapsedGoals' own suite (lapsed-goal-archiving.test.ts)
 * calls that function directly, never through runDailyMaintenance. What was
 * missing is exactly the wiring between them: resolving the owner's own
 * stored time zone (or its documented default, when no settings row exists
 * yet) into the "today" archiveLapsedGoals actually archives against.
 *
 * Reuses the same instant and reasoning as
 * tests/integration/notifications/owner-timezone.test.ts: 9am Sydney is
 * still the previous day in UTC, which is exactly the gap a per-user,
 * per-instant resolution has to get right.
 */

const NINE_AM_SYDNEY = new Date("2026-01-06T22:00:00.000Z");
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const owner = "daily-maintenance-owner";

async function makeGoal(id: string, userId: string, targetDate: Date, status: "Active" | "Archived" = "Active") {
  await prisma.object.create({ data: { id: `${id}-obj`, type: "GOAL", userId, name: id } });
  return prisma.goal.create({ data: { id, objectId: `${id}-obj`, userId, name: id, targetDate, status } });
}

describe.sequential("runDailyMaintenance", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Daily", lastName: "Owner", email: "daily-maintenance@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("archives a goal that has lapsed in the owner's own timezone", async () => {
    await prisma.userSettings.create({ data: { userId: owner, timeZone: "Australia/Sydney" } });
    // Yesterday relative to Sydney's 9am-Jan-7, but still "today" in UTC.
    const goal = await makeGoal("lapsed-sydney-goal", owner, day("2026-01-06"));

    const result = await runDailyMaintenance(owner, NINE_AM_SYDNEY);

    expect(result).toEqual({ goalsArchived: 1 });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).resolves.toMatchObject({ status: "Archived" });
  });

  /** The same target date, the same instant -- not yet lapsed for an owner who is actually on UTC. */
  it("does not archive the same goal yet for an owner on UTC at that same instant", async () => {
    await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC" } });
    const goal = await makeGoal("not-lapsed-utc-goal", owner, day("2026-01-06"));

    const result = await runDailyMaintenance(owner, NINE_AM_SYDNEY);

    expect(result).toEqual({ goalsArchived: 0 });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).resolves.toMatchObject({ status: "Active" });
  });

  it("falls back to the configured default timezone when no settings row exists yet", async () => {
    await expect(prisma.userSettings.findUnique({ where: { userId: owner } })).resolves.toBeNull();
    const goal = await makeGoal("default-zone-goal", owner, day("2026-01-06"));

    // Same outcome as the explicit Australia/Sydney case above: the default
    // is documented (DEFAULT_TIME_ZONE) as "Australia/Sydney", not UTC.
    const result = await runDailyMaintenance(owner, NINE_AM_SYDNEY);

    expect(result).toEqual({ goalsArchived: 1 });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).resolves.toMatchObject({ status: "Archived" });
  });

  it("leaves an already-archived goal and a goal that hasn't lapsed yet untouched", async () => {
    await prisma.userSettings.create({ data: { userId: owner, timeZone: "Australia/Sydney" } });
    const alreadyArchived = await makeGoal("already-archived-goal", owner, day("2026-01-01"), "Archived");
    const notYetDue = await makeGoal("not-yet-due-goal", owner, day("2026-06-01"));

    const result = await runDailyMaintenance(owner, NINE_AM_SYDNEY);

    expect(result).toEqual({ goalsArchived: 0 });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: alreadyArchived.id } })).resolves.toMatchObject({ status: "Archived" });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: notYetDue.id } })).resolves.toMatchObject({ status: "Active" });
  });

  it("only archives the given user's own goals, and reports the exact count archived", async () => {
    await prisma.userSettings.create({ data: { userId: owner, timeZone: "Australia/Sydney" } });
    await makeGoal("owner-lapsed-1", owner, day("2026-01-01"));
    await makeGoal("owner-lapsed-2", owner, day("2026-01-05"));

    const stranger = "daily-maintenance-stranger";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "daily-maintenance-stranger@example.test" } });
    await prisma.userSettings.create({ data: { userId: stranger, timeZone: "Australia/Sydney" } });
    const strangerGoal = await makeGoal("stranger-lapsed-goal", stranger, day("2026-01-01"));

    const result = await runDailyMaintenance(owner, NINE_AM_SYDNEY);

    expect(result).toEqual({ goalsArchived: 2 });
    await expect(prisma.goal.findUniqueOrThrow({ where: { id: strangerGoal.id } })).resolves.toMatchObject({ status: "Active" });
    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});
