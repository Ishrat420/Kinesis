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
 * writes nothing, and the one thing that is stored survives an edit that has
 * nothing to do with it.
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

  it("shows what is due without storing any of it", async () => {
    const { enabled, notifications, unreadCount } = await getRecentNotifications();

    expect(enabled).toBe(true);
    expect(notifications.map(({ key }) => key)).toEqual(["todo:todo-1:TODO_DUE:2020-05-01", EXPIRED_KEY]);
    expect(unreadCount).toBe(2);
    // Nothing was written to show them.
    await expect(prisma.notificationRead.count()).resolves.toBe(0);
  });

  it("writes nothing however many times the page is rendered", async () => {
    const before = await prisma.document.findUniqueOrThrow({ where: { id: "doc-1" }, select: { updatedAt: true } });
    await getRecentNotifications();
    await getRecentNotifications();
    await getRecentNotifications();

    await expect(prisma.notificationRead.count()).resolves.toBe(0);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: "doc-1" }, select: { updatedAt: true } })).resolves.toEqual(before);
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
