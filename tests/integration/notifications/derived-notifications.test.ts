import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getRecentNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/data/notifications";

/**
 * The whole point of the change, against a real database: reading the bell
 * writes no *read* marker, and the one thing that is stored there survives an
 * edit that has nothing to do with it. It does write a `NotificationFirstSeen`
 * row -- once, ever, per notification -- which is its own, separate
 * invariant this file also pins (see "writes nothing however many times the
 * page is rendered" below).
 *
 * Deadlines are set in the past rather than relative to the clock, so a
 * document is reliably expired and a To-Do reliably overdue whenever this runs.
 */
const owner = "derived-owner";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const EXPIRED_KEY = "document:doc-1:EXPIRED:2020-06-01";

async function seed() {
  await prisma.user.create({ data: { id: owner, firstName: "Derived", lastName: "Owner", email: "derived@example.test" } });
  await prisma.object.create({ data: { id: "object-doc-1", type: "DOCUMENT", name: "Passport", userId: owner } });
  await prisma.document.create({ data: {
    id: "doc-1", name: "Passport", type: "Passport", status: "Active", owner: "Derived",
    userId: owner, objectId: "object-doc-1", expiryDate: day("2020-06-01"), prompt: 180,
  } });
  await prisma.object.create({ data: { id: "object-todo-1", type: "TODO", name: "Renew rego", userId: owner } });
  await prisma.todo.create({ data: { id: "todo-1", name: "Renew rego", userId: owner, objectId: "object-todo-1", dueDate: day("2020-05-01") } });
}

describe.sequential("notifications are derived, not stored", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await seed();
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("shows what is due without storing a read marker for any of it", async () => {
    const { enabled, notifications, unreadCount } = await getRecentNotifications();

    expect(enabled).toBe(true);
    // Both notifications are newly seen in this same call, so they tie on
    // firstSeenAt; byUrgency (expiryDate ascending) breaks it, and the to-do's
    // 1 May 2020 sorts ahead of the document's 1 June 2020.
    expect(notifications.map(({ key }) => key)).toEqual(["todo:todo-1:TODO_DUE:2020-05-01", EXPIRED_KEY]);
    expect(unreadCount).toBe(2);
    // Nothing was written to show them as read.
    await expect(prisma.notificationRead.count()).resolves.toBe(0);
  });

  it("writes no read marker, however many times the page is rendered -- and records first-seen only once", async () => {
    const before = await prisma.document.findUniqueOrThrow({ where: { id: "doc-1" }, select: { updatedAt: true } });
    await getRecentNotifications();
    await getRecentNotifications();
    await getRecentNotifications();

    await expect(prisma.notificationRead.count()).resolves.toBe(0);
    // The first render wrote one NotificationFirstSeen row per notification;
    // the second and third found both already there and wrote nothing more.
    await expect(prisma.notificationFirstSeen.count()).resolves.toBe(2);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: "doc-1" }, select: { updatedAt: true } })).resolves.toEqual(before);
  });

  /**
   * The actual bug report this shape existed to fix: a document created with
   * only a short runway to its own expiry has a reminder-window date well in
   * the past (expiry minus a long prompt), so a new notification for it used
   * to sort below older ones -- the newest alert landing at the bottom of an
   * inbox. It must sort above notifications that were already on screen,
   * however old what it's about is.
   */
  it("puts a document created just now above notifications the owner has already seen, regardless of its own deadline", async () => {
    // Renders once, so both existing notifications' firstSeenAt is now in
    // the (very recent) past relative to what comes next.
    await getRecentNotifications();

    // A brand-new document, expiring soon, but with a long enough prompt that
    // its reminder window opened years before "today" -- an old date to
    // derive from, same shape as the bug report.
    await prisma.object.create({ data: { id: "object-doc-2", type: "DOCUMENT", name: "Licence", userId: owner } });
    await prisma.document.create({ data: {
      id: "doc-2", name: "Licence", type: "Licence", status: "Active", owner: "Derived",
      userId: owner, objectId: "object-doc-2", expiryDate: day("2020-06-15"), prompt: 180,
    } });

    const { notifications } = await getRecentNotifications();

    expect(notifications[0]).toMatchObject({ source: "document", sourceId: "doc-2" });
  });

  it("remembers a notification that has been read", async () => {
    await markNotificationRead(EXPIRED_KEY, "document", "doc-1");

    const { notifications, unreadCount } = await getRecentNotifications();
    expect(notifications.find(({ key }) => key === EXPIRED_KEY)?.readAt).toEqual(expect.any(Date));
    expect(unreadCount).toBe(1);
  });

  it("does not read the same notification twice", async () => {
    await markNotificationRead(EXPIRED_KEY, "document", "doc-1");
    await markNotificationRead(EXPIRED_KEY, "document", "doc-1");

    await expect(prisma.notificationRead.count()).resolves.toBe(1);
  });

  /**
   * The behaviour the old table got wrong. It stored the document's name, so an
   * edit deleted the row and re-created it, handing back a reminder that had
   * already been read.
   */
  it("keeps a notification read when the record is renamed", async () => {
    await markNotificationRead(EXPIRED_KEY, "document", "doc-1");
    await prisma.document.update({ where: { id: "doc-1" }, data: { name: "Passport (renewed)" } });

    const { notifications, unreadCount } = await getRecentNotifications();
    const renamed = notifications.find(({ key }) => key === EXPIRED_KEY);
    expect(renamed?.documentName).toBe("Passport (renewed)");
    expect(renamed?.readAt).toEqual(expect.any(Date));
    expect(unreadCount).toBe(1);
  });

  /** Moving the deadline is a different notification, and speaks again. */
  it("speaks again when the deadline moves", async () => {
    await markNotificationRead(EXPIRED_KEY, "document", "doc-1");
    await prisma.document.update({ where: { id: "doc-1" }, data: { expiryDate: day("2020-07-01") } });

    const { notifications, unreadCount } = await getRecentNotifications();
    const moved = notifications.find(({ source }) => source === "document");
    expect(moved?.key).toBe("document:doc-1:EXPIRED:2020-07-01");
    expect(moved?.readAt).toBeNull();
    expect(unreadCount).toBe(2);
  });

  it("marks everything read in one go, and stays that way", async () => {
    await markAllNotificationsRead();

    await expect(prisma.notificationRead.count()).resolves.toBe(2);
    expect((await getRecentNotifications()).unreadCount).toBe(0);
  });

  it("takes a read marker with the record it was about", async () => {
    await markAllNotificationsRead();
    await prisma.document.delete({ where: { id: "doc-1" } });

    await expect(prisma.notificationRead.findMany({ select: { itemKey: true } }))
      .resolves.toEqual([{ itemKey: "todo:todo-1:TODO_DUE:2020-05-01" }]);
  });

  it("hides the bell rather than emptying it when in-app notifications are off", async () => {
    await prisma.userSettings.create({ data: { userId: owner, notificationsEnabled: false } });

    expect(await getRecentNotifications()).toEqual({ enabled: false, notifications: [], unreadCount: 0 });
  });

  /**
   * KD-028: a goal past its target date, still Active, raises GOAL_DUE in
   * the bell -- the same reconciled shape as EXPIRED/TODO_DUE, read fresh
   * every time rather than a stored event.
   */
  it("raises GOAL_DUE for a goal past its target date, still Active", async () => {
    await prisma.object.create({ data: { id: "object-goal-1", type: "GOAL", name: "Move house", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Move house", status: "Active", targetDate: day("2020-05-15"), userId: owner, objectId: "object-goal-1" } });

    const { notifications } = await getRecentNotifications();

    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "goal:goal-1:GOAL_DUE:2020-05-15", source: "goal", sourceId: "goal-1", message: "Move house is over its due date", documentType: "Goal" }),
    ]));
  });

  it("does not raise GOAL_DUE for a goal that is no longer Active, even past its target date", async () => {
    await prisma.object.create({ data: { id: "object-goal-1", type: "GOAL", name: "Move house", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Move house", status: "Archived", targetDate: day("2020-05-15"), userId: owner, objectId: "object-goal-1" } });

    const { notifications } = await getRecentNotifications();

    expect(notifications.find(({ source }) => source === "goal")).toBeUndefined();
  });

  it("marks a goal's overdue notification read, and takes it with the goal when deleted", async () => {
    await prisma.object.create({ data: { id: "object-goal-1", type: "GOAL", name: "Move house", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Move house", status: "Active", targetDate: day("2020-05-15"), userId: owner, objectId: "object-goal-1" } });
    const key = "goal:goal-1:GOAL_DUE:2020-05-15";

    await markNotificationRead(key, "goal", "goal-1");
    await expect(prisma.notificationRead.findMany({ where: { userId: owner, goalId: "goal-1" } })).resolves.toHaveLength(1);

    await prisma.goal.delete({ where: { id: "goal-1" } });
    await expect(prisma.notificationRead.findMany({ where: { itemKey: key } })).resolves.toEqual([]);
  });

  /** The badge speaks for everything pending; the panel shows only a few. */
  it("counts every unread one past the display limit", async () => {
    for (let index = 0; index < 10; index += 1) {
      await prisma.object.create({ data: { id: `object-extra-${index}`, type: "TODO", name: `Extra ${index}`, userId: owner } });
      await prisma.todo.create({ data: { id: `extra-${index}`, name: `Extra ${index}`, userId: owner, objectId: `object-extra-${index}`, dueDate: day("2020-04-01") } });
    }

    const { notifications, unreadCount } = await getRecentNotifications(8);
    expect(notifications).toHaveLength(8);
    expect(unreadCount).toBe(12);
  });
});
