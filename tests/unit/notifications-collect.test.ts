import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  readFindMany: vi.fn(async (): Promise<unknown[]> => []),
  goalUpdateMany: vi.fn(async () => ({ count: 0 })),
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
    notificationRead: { findMany: mocks.readFindMany },
    goal: { updateMany: mocks.goalUpdateMany },
  },
}));

import { collectNotifications } from "@/lib/notifications/engine";

const NOW = new Date("2026-07-01T00:00:00.000Z");
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const expiredPassport = [{
  id: "doc-1", name: "Passport", type: "Passport",
  expiryDate: day("2026-03-01"), prompt: 180, archived: false,
}];
const expiringLicence = [{
  id: "doc-2", name: "Licence", type: "Licence",
  expiryDate: day("2026-08-01"), prompt: 180, archived: false,
}];

const settings = (overrides: Record<string, unknown> = {}) => ({
  locale: "en-AU", currency: "AUD", timeZone: "UTC",
  notificationsEnabled: true, remindersEnabled: true,
  milestoneReminderLeadDays: 30, relationshipReminderLeadDays: 30, customItemReminderLeadDays: 30,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsFindUnique.mockResolvedValue(settings());
  for (const query of [mocks.documentFindMany, mocks.milestoneFindMany, mocks.importantDateFindMany, mocks.customItemFindMany, mocks.todoFindMany, mocks.readFindMany]) {
    query.mockResolvedValue([]);
  }
});

describe("collecting derives rather than stores", () => {
  it("writes nothing at all", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    await collectNotifications("user-1", NOW);

    // Every mocked client member is a read. A write would have thrown on an
    // undefined method rather than passing quietly.
    expect(mocks.readFindMany).toHaveBeenCalledTimes(1);
  });

  /**
   * The In-app notifications switch lives on the reader, not here: it decides
   * whether the bell is shown, not what would be in it. Deriving regardless is
   * what stops switching it back on from producing a backlog.
   */
  it("takes no notice of the In-app notifications switch", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiredPassport);

    expect(await collectNotifications("user-1", NOW)).toMatchObject([{ type: "EXPIRED" }]);
  });

  it("gives every notification a stable key naming the record, the type and the deadline", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    const [first] = await collectNotifications("user-1", NOW);
    const [again] = await collectNotifications("user-1", NOW);

    expect(first.key).toBe("document:doc-1:EXPIRED:2026-03-01");
    expect(again.key).toBe(first.key);
    expect(first).toMatchObject({ source: "document", sourceId: "doc-1" });
  });

  it("joins read state on by key, in one query rather than one per notification", async () => {
    mocks.documentFindMany.mockResolvedValue([...expiredPassport, ...expiringLicence]);
    mocks.readFindMany.mockResolvedValue([
      { itemKey: "document:doc-1:EXPIRED:2026-03-01", readAt: day("2026-06-30") },
    ]);

    const collected = await collectNotifications("user-1", NOW);

    expect(mocks.readFindMany).toHaveBeenCalledTimes(1);
    expect(collected.find(({ sourceId }) => sourceId === "doc-1")?.readAt).toEqual(day("2026-06-30"));
    expect(collected.find(({ sourceId }) => sourceId === "doc-2")?.readAt).toBeNull();
  });
});

describe("Reminders governs advance notice only", () => {
  it("keeps saying a document has expired when reminders are off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiredPassport);

    expect(await collectNotifications("user-1", NOW)).toMatchObject([{ type: "EXPIRED" }]);
  });

  it("withholds the advance reminder for one that has not expired yet", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(expiringLicence);

    expect(await collectNotifications("user-1", NOW)).toEqual([]);
  });

  /** TODO_DUE is a statement of fact, not a prediction, so it survives the switch. */
  it("still speaks for an overdue To-Do when reminders are off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-06-30"), status: "TODO" }]);

    expect(await collectNotifications("user-1", NOW)).toMatchObject([{ type: "TODO_DUE" }]);
  });

  /** A To-Do's advance phase (KD-027) is exactly the kind of prediction this switch governs. */
  it("withholds a to-do's advance reminder when reminders are off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false, todoReminderLeadDays: 7 }));
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-07-05"), status: "TODO" }]);

    expect(await collectNotifications("user-1", NOW)).toEqual([]);
  });

  it("still raises a to-do's advance reminder once reminders are back on", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ todoReminderLeadDays: 7 }));
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-07-05"), status: "TODO" }]);

    expect(await collectNotifications("user-1", NOW)).toMatchObject([{ type: "REMINDER_DUE" }]);
  });
});

describe("ordering is deterministic", () => {
  /**
   * The bell is an inbox, not a countdown -- newest alert on top, where
   * "newest" means the day the notification's own current message became
   * true (its advance window opening, or the deadline itself once overdue),
   * not how soon or how overdue the deadline is. That's Upcoming & Due's own
   * ordering (lib/data/upcoming.ts), sorted the opposite way on purpose.
   */
  it("puts whichever notification most recently started speaking first, not the nearest deadline", async () => {
    // doc-1 (Passport) expired back on 1 March -- an old alert. doc-2
    // (Licence) only opened its advance window on 1 February, older still.
    // todo-1 became overdue on 1 June -- the most recent of the three, even
    // though its deadline (1 June) is not the soonest or the most overdue.
    mocks.documentFindMany.mockResolvedValue([...expiringLicence, ...expiredPassport]);
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-06-01"), status: "TODO" }]);

    expect((await collectNotifications("user-1", NOW)).map(({ sourceId }) => sourceId))
      .toEqual(["todo-1", "doc-1", "doc-2"]);
  });

  /**
   * Everything here is calendar-day granularity, so two notifications
   * starting to speak on the very same day is common, not an edge case.
   * The tie favours the more urgent one -- the same comparator that used to
   * be the primary sort (byUrgency) is still reached for, just demoted to
   * tiebreak.
   */
  it("breaks a same-day tie in favour of the more urgent notification", async () => {
    // Licence's advance window opens today (1 July), 6 months ahead of its
    // real 1 January 2027 deadline -- merely a first notice. The to-do
    // becomes overdue today too, its deadline itself today -- already late.
    // Both started speaking today; the to-do is the more urgent of the two.
    mocks.documentFindMany.mockResolvedValue([{ id: "doc-2", name: "Licence", type: "Licence", expiryDate: day("2027-01-01"), prompt: 180, archived: false }]);
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-07-01"), status: "TODO" }]);

    expect((await collectNotifications("user-1", NOW)).map(({ sourceId }) => sourceId))
      .toEqual(["todo-1", "doc-2"]);
  });

  /** Nothing in the comparator reads the clock, so the panel cannot reshuffle itself. */
  it("breaks ties the same way every time", async () => {
    const sameDay = [
      { id: "doc-a", name: "A", type: "T", expiryDate: day("2026-03-01"), prompt: 180, archived: false },
      { id: "doc-b", name: "B", type: "T", expiryDate: day("2026-03-01"), prompt: 180, archived: false },
    ];
    mocks.documentFindMany.mockResolvedValue(sameDay);
    const first = (await collectNotifications("user-1", NOW)).map(({ key }) => key);
    mocks.documentFindMany.mockResolvedValue([...sameDay].reverse());
    const second = (await collectNotifications("user-1", NOW)).map(({ key }) => key);

    expect(second).toEqual(first);
  });
});

describe("the narrowed queries cannot drop a candidate", () => {
  it("looks a full year ahead for documents, which is the longest reminder there is", async () => {
    await collectNotifications("user-1", NOW);
    const [{ where }] = mocks.documentFindMany.mock.calls[0] as unknown as [{ where: { expiryDate: { lte: Date } } }];

    // The longest prompt is a calendar year, so anything expiring sooner than
    // that could already be inside its reminder window.
    expect(where.expiryDate.lte.getTime()).toBeGreaterThanOrEqual(day("2027-07-01").getTime());
  });

  it("looks exactly as far ahead as each lead time allows", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ milestoneReminderLeadDays: 10, customItemReminderLeadDays: 45 }));
    await collectNotifications("user-1", NOW);

    const [milestone] = mocks.milestoneFindMany.mock.calls[0] as unknown as [{ where: { dueDate: { lte: Date } } }];
    const [custom] = mocks.customItemFindMany.mock.calls[0] as unknown as [{ where: { dueDate: { lte: Date } } }];
    expect(milestone.where.dueDate.lte).toEqual(day("2026-07-11"));
    expect(custom.where.dueDate.lte).toEqual(day("2026-08-15"));
  });

  /** With nothing configured, a to-do uses the same 30-day default as the others (KD-027). */
  it("looks 30 days ahead for a To-Do by default", async () => {
    await collectNotifications("user-1", NOW);
    const [{ where }] = mocks.todoFindMany.mock.calls[0] as unknown as [{ where: { dueDate: { lte: Date } } }];

    expect(where.dueDate.lte).toEqual(day("2026-07-31"));
  });

  it("looks as far ahead as the to-do lead time allows, once configured differently from the default", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ todoReminderLeadDays: 7 }));
    await collectNotifications("user-1", NOW);

    const [{ where }] = mocks.todoFindMany.mock.calls[0] as unknown as [{ where: { dueDate: { lte: Date } } }];
    expect(where.dueDate.lte).toEqual(day("2026-07-08"));
  });
});
