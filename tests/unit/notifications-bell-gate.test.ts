import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  getSettings: vi.fn(async (): Promise<unknown> => ({})),
  runNotificationEngine: vi.fn(async () => ({ evaluated: 0, created: 0, removed: 0 })),
  notificationFindMany: vi.fn(async (): Promise<unknown[]> => []),
  notificationCount: vi.fn(async () => 0),
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  goalUpdateMany: vi.fn(async () => ({ count: 0 })),
  notificationDeleteMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/notifications/engine", () => ({ runNotificationEngine: mocks.runNotificationEngine }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    notification: { findMany: mocks.notificationFindMany, count: mocks.notificationCount, deleteMany: mocks.notificationDeleteMany },
    userSettings: { findUnique: mocks.settingsFindUnique },
    document: { findMany: mocks.documentFindMany },
    milestone: { findMany: mocks.milestoneFindMany },
    relationshipImportantDate: { findMany: mocks.importantDateFindMany },
    customItem: { findMany: mocks.customItemFindMany },
    todo: { findMany: mocks.todoFindMany },
    goal: { updateMany: mocks.goalUpdateMany },
  },
}));

import { getRecentNotifications } from "@/lib/data/notifications";

const settings = (overrides: Record<string, unknown> = {}) => ({
  notificationsEnabled: true,
  remindersEnabled: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "user-1" });
  mocks.getSettings.mockResolvedValue(settings());
  mocks.notificationFindMany.mockResolvedValue([]);
  mocks.notificationCount.mockResolvedValue(0);
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

  it("reads no rows and raises no count while it is off", async () => {
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false }));
    await getRecentNotifications();

    expect(mocks.notificationFindMany).not.toHaveBeenCalled();
    expect(mocks.notificationCount).not.toHaveBeenCalled();
  });

  it("does not reconcile on a page load while it is off", async () => {
    // Nothing is going to be read, so there is nothing to bring up to date on
    // this path. The daily pass still keeps the table honest.
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false }));
    await getRecentNotifications();

    expect(mocks.runNotificationEngine).not.toHaveBeenCalled();
  });

  it("still reconciles before reading when it is on", async () => {
    await getRecentNotifications();

    expect(mocks.runNotificationEngine).toHaveBeenCalledWith("user-1");
  });

  it("leaves reminders alone: turning the bell off is not turning reminders off", async () => {
    mocks.getSettings.mockResolvedValue(settings({ notificationsEnabled: false, remindersEnabled: true }));

    expect((await getRecentNotifications()).enabled).toBe(false);
    expect(mocks.getSettings).toHaveBeenCalled();
  });
});
