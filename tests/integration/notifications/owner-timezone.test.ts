import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { runNotificationEngine } from "@/lib/notifications/engine";

/**
 * The whole chain, against a real database: the stored zone, the day it
 * resolves to, and the notification row that follows from it.
 *
 * 9am Wednesday in Sydney is still Tuesday in UTC, which is the gap the bug
 * lived in -- the engine read `startOfUtcDay(new Date())` and so believed it
 * was Tuesday for the first third of every Sydney day. The unit tests pin the
 * arithmetic; this pins the wiring, which is where a fix like this actually
 * goes wrong.
 */
const NINE_AM_SYDNEY = new Date("2026-01-06T22:00:00.000Z");
const owner = "tz-owner";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function seed(timeZone: string) {
  await prisma.user.create({ data: { id: owner, firstName: "Zone", lastName: "Owner", email: "zone-owner@example.test" } });
  await prisma.userSettings.create({ data: { userId: owner, timeZone } });
  const object = await prisma.object.create({ data: { id: "todo-object", type: "TODO", name: "Renew rego", userId: owner } });
  await prisma.todo.create({ data: { id: "todo-1", name: "Renew rego", userId: owner, objectId: object.id, dueDate: day("2026-01-07") } });
}

describe.sequential("the owner's day decides what is due", () => {
  beforeEach(async () => { await prisma.user.deleteMany({ where: { id: owner } }); });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("raises a to-do due today for an owner whose day has already started", async () => {
    await seed("Australia/Sydney");

    await runNotificationEngine(owner, NINE_AM_SYDNEY);

    await expect(prisma.notification.findMany({ where: { userId: owner }, select: { todoId: true, type: true, message: true } }))
      .resolves.toEqual([{ todoId: "todo-1", type: "TODO_DUE", message: "Renew rego is due today" }]);
  });

  /** The same instant, the same to-do -- and in UTC it is genuinely not due yet. */
  it("stays quiet at that instant for an owner who is actually on UTC", async () => {
    await seed("UTC");

    await runNotificationEngine(owner, NINE_AM_SYDNEY);

    await expect(prisma.notification.count({ where: { userId: owner } })).resolves.toBe(0);
  });

  /**
   * Two different fallbacks meet here, and they answer differently on purpose.
   * A stored value goes through `resolveFormatPreferences`, which lands on the
   * configured default the way an unreadable locale or currency does -- so this
   * account behaves as Sydney, not as UTC. `startOfDayIn` has its own fallback
   * to UTC underneath, for a caller that reaches it without validating first.
   */
  it("treats an unreadable stored zone as the configured default, not as UTC", async () => {
    await seed("Mars/Olympus_Mons");

    await expect(runNotificationEngine(owner, NINE_AM_SYDNEY)).resolves.toMatchObject({ evaluated: expect.any(Number) });
    await expect(prisma.notification.count({ where: { userId: owner } })).resolves.toBe(1);
  });

  /**
   * The cron evaluates every account in one process at one UTC instant, so the
   * zone has to be read per user rather than once for the run.
   */
  it("gives each account its own day in a single pass", async () => {
    await seed("Australia/Sydney");
    await prisma.user.create({ data: { id: "tz-other", firstName: "Other", lastName: "Owner", email: "other-owner@example.test" } });
    await prisma.userSettings.create({ data: { userId: "tz-other", timeZone: "UTC" } });
    const object = await prisma.object.create({ data: { id: "other-todo-object", type: "TODO", name: "Renew rego", userId: "tz-other" } });
    await prisma.todo.create({ data: { id: "other-todo", name: "Renew rego", userId: "tz-other", objectId: object.id, dueDate: day("2026-01-07") } });

    await runNotificationEngine(owner, NINE_AM_SYDNEY);
    await runNotificationEngine("tz-other", NINE_AM_SYDNEY);

    await expect(prisma.notification.count({ where: { userId: owner } })).resolves.toBe(1);
    await expect(prisma.notification.count({ where: { userId: "tz-other" } })).resolves.toBe(0);
    await prisma.user.deleteMany({ where: { id: "tz-other" } });
  });
});
