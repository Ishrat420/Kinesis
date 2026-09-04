import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  goalUpdateMany: vi.fn(async () => ({ count: 0 })),
  notificationDeleteMany: vi.fn(async () => ({ count: 0 })),
  notificationCreateMany: vi.fn(async () => ({ count: 1 })),
  notificationUpdateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    userSettings: { findUnique: mocks.settingsFindUnique },
    document: { findMany: mocks.documentFindMany },
    milestone: { findMany: mocks.milestoneFindMany },
    relationshipImportantDate: { findMany: mocks.importantDateFindMany },
    customItem: { findMany: mocks.customItemFindMany },
    todo: { findMany: mocks.todoFindMany },
    goal: { updateMany: mocks.goalUpdateMany },
    notification: {
      deleteMany: mocks.notificationDeleteMany,
      createMany: mocks.notificationCreateMany,
      updateMany: mocks.notificationUpdateMany,
    },
  },
}));

import { runNotificationEngine } from "@/lib/notifications/engine";

const NOW = new Date("2026-07-01T00:00:00.000Z");
const expiredPassport = [{
  id: "doc-1", name: "Passport", type: "Passport",
  expiryDate: new Date("2026-03-01T00:00:00.000Z"), prompt: 180, archived: false,
}];

const settings = (overrides: Record<string, unknown> = {}) => ({
  locale: "en-AU", currency: "AUD",
  notificationsEnabled: true, remindersEnabled: true,
  milestoneReminderLeadDays: 30, relationshipReminderLeadDays: 30, customItemReminderLeadDays: 30,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsFindUnique.mockResolvedValue(settings());
  mocks.documentFindMany.mockResolvedValue([]);
  mocks.milestoneFindMany.mockResolvedValue([]);
  mocks.importantDateFindMany.mockResolvedValue([]);
  mocks.customItemFindMany.mockResolvedValue([]);
  mocks.todoFindMany.mockResolvedValue([]);
});

describe("the engine takes no notice of the In-app notifications switch", () => {
  it("still evaluates every source while the bell is off", async () => {
    // It used to return { evaluated: 0 } here, which stopped the cleanup as
    // well as the writing and left rows that reappeared on re-enabling.
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiredPassport);

    expect(await runNotificationEngine("user-1", NOW)).toMatchObject({ evaluated: 1 });
  });

  it("still writes the row, so switching the bell on shows the truth rather than a backlog", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    await runNotificationEngine("user-1", NOW);

    const [insert] = mocks.notificationCreateMany.mock.calls[0] as unknown as [{ data: { type: string }[] }];
    expect(insert.data[0].type).toBe("EXPIRED");
  });

  it("still runs its cleanup pass while the bell is off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    await runNotificationEngine("user-1", NOW);

    expect(mocks.notificationDeleteMany).toHaveBeenCalled();
  });

  it("behaves identically whether the bell is on or off", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    const on = await runNotificationEngine("user-1", NOW);

    vi.clearAllMocks();
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    mocks.milestoneFindMany.mockResolvedValue([]);
    mocks.importantDateFindMany.mockResolvedValue([]);
    mocks.customItemFindMany.mockResolvedValue([]);
    mocks.todoFindMany.mockResolvedValue([]);
    const off = await runNotificationEngine("user-1", NOW);

    expect(off).toEqual(on);
  });
});
