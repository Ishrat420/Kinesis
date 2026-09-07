import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivedNotification } from "@/lib/notifications/engine";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  getSettings: vi.fn(async (): Promise<unknown> => ({})),
  collectNotifications: vi.fn(async (): Promise<unknown[]> => []),
  readCreateMany: vi.fn(async () => ({ count: 0 })),
  readUpsert: vi.fn(async () => ({})),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/notifications/engine", () => ({
  collectNotifications: mocks.collectNotifications,
  runDailyMaintenance: vi.fn(),
}));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    notificationRead: { createMany: mocks.readCreateMany, upsert: mocks.readUpsert },
    user: { findMany: vi.fn(async () => []) },
  },
}));

import { getRecentNotifications, markAllNotificationsRead } from "@/lib/data/notifications";

const settings = (overrides: Record<string, unknown> = {}) => ({
  notificationsEnabled: true,
  remindersEnabled: true,
  ...overrides,
});

/** A derived notification, only as far as the bell cares about it. */
const derived = (key: string, readAt: Date | null = null): DerivedNotification => ({
  key, source: "todo", sourceId: key, readAt,
  type: "TODO_DUE", reminderAt: null, timeUntilExpiry: null,
  expiryDate: new Date("2026-01-07T00:00:00.000Z"),
  documentName: key, documentType: "To-do", message: `${key} is due today`,
  actionUrl: "/todos", moduleIcon: null, moduleColor: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "user-1" });
  mocks.getSettings.mockResolvedValue(settings());
  mocks.collectNotifications.mockResolvedValue([]);
});

describe("In-app notifications governs the bell and nothing else", () => {
  it("reports the bell as enabled by default", async () => {
    expect((await getRecentNotifications()).enabled).toBe(true);
  });

  it("reports it disabled, so the bell can be hidden rather than shown empty", async () => {
    // An empty bell reading "You're all caught up" would claim nothing is
    // pending, when things are only being withheld.
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false }));

    expect(await getRecentNotifications()).toEqual({ enabled: false, notifications: [], unreadCount: 0 });
  });

  it("derives nothing at all while it is off", async () => {
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false }));
    await getRecentNotifications();

    expect(mocks.collectNotifications).not.toHaveBeenCalled();
  });

  it("leaves reminders alone: turning the bell off is not turning reminders off", async () => {
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false, remindersEnabled: true }));

    expect((await getRecentNotifications()).enabled).toBe(false);
    expect(mocks.getSettings).toHaveBeenCalled();
  });
});

describe("reading the bell writes nothing", () => {
  it("issues no write on a page load, however much there is to show", async () => {
    mocks.collectNotifications.mockResolvedValue([derived("a"), derived("b"), derived("c")]);

    await getRecentNotifications();

    expect(mocks.readCreateMany).not.toHaveBeenCalled();
    expect(mocks.readUpsert).not.toHaveBeenCalled();
  });
});

describe("the unread badge counts the whole set, not the page", () => {
  /**
   * The panel shows the most urgent few while the badge speaks for everything
   * pending, so counting the slice would under-report the moment there were
   * more than `limit` of them.
   */
  it("counts past the display limit", async () => {
    mocks.collectNotifications.mockResolvedValue(Array.from({ length: 12 }, (_, index) => derived(`todo-${index}`)));

    const { notifications, unreadCount } = await getRecentNotifications(8);

    expect(notifications).toHaveLength(8);
    expect(unreadCount).toBe(12);
  });

  it("counts only what is actually unread", async () => {
    mocks.collectNotifications.mockResolvedValue([
      derived("read-one", new Date("2026-01-06T00:00:00.000Z")),
      derived("unread-one"),
      derived("read-two", new Date("2026-01-06T00:00:00.000Z")),
    ]);

    expect((await getRecentNotifications()).unreadCount).toBe(1);
  });

  it("marks every unread one, including those the panel never showed", async () => {
    mocks.collectNotifications.mockResolvedValue([
      derived("already", new Date("2026-01-06T00:00:00.000Z")),
      ...Array.from({ length: 10 }, (_, index) => derived(`todo-${index}`)),
    ]);

    await markAllNotificationsRead();

    expect(mocks.readCreateMany).toHaveBeenCalledTimes(1);
    const [{ data }] = mocks.readCreateMany.mock.calls[0] as unknown as [{ data: { itemKey: string }[] }];
    expect(data).toHaveLength(10);
    expect(data.map(({ itemKey }) => itemKey)).not.toContain("already");
  });
});
