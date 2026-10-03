import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), sendPush: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/push/sender", () => ({ getVapidPublicKey: () => "test-public-key", sendPush: mocks.sendPush }));

import { prisma } from "@/lib/data/prisma";
import { markPushedNotificationOpened, runDailyPush, savePushSubscription } from "@/lib/data/push";
import { PUSH_OPEN_PARAM } from "@/lib/push/payload";

/**
 * KD-053 against a real database: the daily run pushes exactly what the bell
 * shows, once per notification key, and never the backlog that was already
 * there when push was turned on.
 *
 * Deadlines are fixed dates and every run passes its own `now`, so nothing
 * here depends on the real clock -- except turning push on, which derives the
 * bell as of today; everything seeded before that is long overdue.
 */
const owner = "push-owner";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const RUN_AT = day("2030-01-10");

function device(name: string) {
  return { endpoint: `https://push.example.test/${name}`, keys: { p256dh: `${name}-p256dh`, auth: `${name}-auth` } };
}

async function todo(id: string, dueDate: Date) {
  await prisma.object.create({ data: { id: `object-${id}`, type: "TODO", name: id, userId: owner } });
  await prisma.todo.create({ data: { id, name: `Do ${id}`, userId: owner, objectId: `object-${id}`, dueDate } });
}

const pushedTags = () => mocks.sendPush.mock.calls.map(([, payload]) => payload.tag);

describe.sequential("the daily push run", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    mocks.sendPush.mockResolvedValue("sent");
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Push", lastName: "Owner", email: "push@example.test" } });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("doesn't push what was already on the bell when push was turned on", async () => {
    await todo("backlog", day("2020-01-01"));
    await savePushSubscription(device("phone"), "Phone");

    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("pushes a new bell item once, with the bell's text, to every device", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await savePushSubscription(device("laptop"), "Laptop");
    await todo("new", day("2030-01-05"));

    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 1 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
    const [target, payload] = mocks.sendPush.mock.calls[0];
    expect(target).toMatchObject({ endpoint: expect.stringMatching(/^https:\/\/push\.example\.test\//) });
    expect(payload).toEqual({
      title: "Do new",
      body: expect.stringContaining("Do new"),
      url: `/todos?${PUSH_OPEN_PARAM}=${encodeURIComponent("todo:new:TODO_DUE:2030-01-05")}`,
      tag: "todo:new:TODO_DUE:2030-01-05",
      badge: 1,
    });

    mocks.sendPush.mockClear();
    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("pushes again when the deadline moves, since that is a new notification", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await todo("moved", day("2030-01-05"));
    await runDailyPush(RUN_AT);

    await prisma.todo.update({ where: { id: "moved" }, data: { dueDate: day("2030-01-08") } });
    mocks.sendPush.mockClear();
    await runDailyPush(RUN_AT);

    expect(pushedTags()).toEqual(["todo:moved:TODO_DUE:2030-01-08"]);
  });

  it("pushes the overdue notice after the reminder, since its key differs", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await prisma.object.create({ data: { id: "object-doc", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: {
      id: "doc", name: "Passport", type: "Passport", status: "Active", owner: "Push",
      userId: owner, objectId: "object-doc", expiryDate: day("2030-02-01"), prompt: 180,
    } });

    await runDailyPush(RUN_AT);
    await runDailyPush(day("2030-02-02"));

    expect(pushedTags()).toEqual(["document:doc:REMINDER_DUE:2030-02-01", "document:doc:EXPIRED:2030-02-01"]);
  });

  it("badges the app icon with the bell's whole unread count, not just what's new", async () => {
    await todo("backlog", day("2020-01-01"));
    await savePushSubscription(device("phone"), "Phone");
    await todo("new", day("2030-01-05"));
    await todo("read", day("2030-01-06"));
    await prisma.notificationRead.create({ data: { id: "badge-read-marker", userId: owner, itemKey: "todo:read:TODO_DUE:2030-01-06", todoId: "read" } });

    await runDailyPush(RUN_AT);
    expect(pushedTags()).toEqual(["todo:new:TODO_DUE:2030-01-05"]);
    expect(mocks.sendPush.mock.calls[0][1].badge).toBe(2);
  });

  it("skips anything already read in the app", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await todo("read", day("2030-01-05"));
    await prisma.notificationRead.create({ data: { id: "read-marker", userId: owner, itemKey: "todo:read:TODO_DUE:2030-01-05", todoId: "read" } });

    await runDailyPush(RUN_AT);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("pushes nothing while in-app notifications are off, since the bell is hidden", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await prisma.userSettings.create({ data: { userId: owner, notificationsEnabled: false } });
    await todo("hidden", day("2030-01-05"));

    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ users: 0, pushed: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("doesn't re-baseline when a further device is added, so that device still gets what's new", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await todo("waiting", day("2030-01-05"));
    await savePushSubscription(device("tablet"), "Tablet");

    await runDailyPush(RUN_AT);
    expect(pushedTags()).toEqual(["todo:waiting:TODO_DUE:2030-01-05", "todo:waiting:TODO_DUE:2030-01-05"]);
  });

  it("re-baselines after push was turned off everywhere and back on", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await prisma.webPushSubscription.deleteMany({ where: { userId: owner } });
    await todo("while-off", day("2020-01-01"));
    await savePushSubscription(device("phone"), "Phone");

    await runDailyPush(RUN_AT);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("deletes a device the push service no longer knows, and doesn't count the item as pushed", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await todo("gone", day("2030-01-05"));
    mocks.sendPush.mockResolvedValue("gone");

    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 0, removedDevices: 1 });
    await expect(prisma.webPushSubscription.count({ where: { userId: owner } })).resolves.toBe(0);
    await expect(prisma.notificationPushed.count({ where: { userId: owner, itemKey: "todo:gone:TODO_DUE:2030-01-05" } })).resolves.toBe(0);
  });

  it("tries again on the next run when every device failed", async () => {
    await savePushSubscription(device("phone"), "Phone");
    await todo("retry", day("2030-01-05"));
    mocks.sendPush.mockResolvedValue("failed");
    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 0, removedDevices: 0 });

    mocks.sendPush.mockResolvedValue("sent");
    await expect(runDailyPush(RUN_AT)).resolves.toMatchObject({ pushed: 1 });
  });

  it("does nothing when push isn't configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await savePushSubscription(device("phone"), "Phone");
    await todo("unconfigured", day("2030-01-05"));

    await expect(runDailyPush(RUN_AT)).resolves.toEqual({ configured: false, users: 0, pushed: 0, removedDevices: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("refuses a malformed subscription", async () => {
    await expect(savePushSubscription({ endpoint: "http://insecure.example.test", keys: { p256dh: "a", auth: "b" } }, null)).resolves.toEqual({ error: expect.any(String) });
    await expect(savePushSubscription({ endpoint: "https://push.example.test/x" }, null)).resolves.toEqual({ error: expect.any(String) });
    await expect(prisma.webPushSubscription.count({ where: { userId: owner } })).resolves.toBe(0);
  });

  it("marks the notification read when its push is tapped", async () => {
    await todo("tapped", day("2020-01-01"));

    await markPushedNotificationOpened("todo:tapped:TODO_DUE:2020-01-01");
    await markPushedNotificationOpened("not-a-key");

    const reads = await prisma.notificationRead.findMany({ where: { userId: owner }, select: { itemKey: true, todoId: true } });
    expect(reads).toEqual([{ itemKey: "todo:tapped:TODO_DUE:2020-01-01", todoId: "tapped" }]);
  });
});
