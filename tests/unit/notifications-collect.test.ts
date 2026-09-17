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
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
// collectNotifications passes userId/today through explicitly (see
// getAttentionRecords's `scope` param), so this is never actually called --
// it only needs to exist because lib/data/notifications.ts imports it at
// module scope for its other exports (getRecentNotifications, etc.).
vi.mock("@/lib/auth", () => ({ requireKinesisUser: vi.fn() }));
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

import { collectNotifications } from "@/lib/data/notification-collection";

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

  /**
   * KD-017 Phase 0/3's actual bug fix, pinned end to end through
   * collectNotifications rather than just the candidate builder directly
   * (tests/unit/notification-candidates.test.ts already covers that): the
   * old code gated getMilestoneNotificationCandidate/
   * getCustomItemNotificationCandidate from the outside, on remindersEnabled,
   * which dropped MILESTONE_DUE/CUSTOM_ITEM_DUE along with the advance
   * REMINDER_DUE they used to gate correctly. ADR-010 says the overdue phase
   * should survive, same as EXPIRED/TODO_DUE above.
   */
  it("still speaks for an overdue milestone or custom item when reminders are off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.milestoneFindMany.mockResolvedValue([{ id: "milestone-1", name: "Submit application", dueDate: day("2026-06-25"), goalId: "goal-1", goal: { name: "Move house" } }]);
    mocks.customItemFindMany.mockResolvedValue([{ id: "item-1", name: "Passport renewal", dueDate: day("2026-06-20"), moduleId: "module-1", module: { name: "Books", icon: "star", color: "#111111" } }]);

    const collected = await collectNotifications("user-1", NOW);

    expect(collected).toMatchObject([{ type: "MILESTONE_DUE" }, { type: "CUSTOM_ITEM_DUE" }]);
  });

  it("withholds a milestone or custom item's advance reminder when reminders are off, unlike its overdue phase", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.milestoneFindMany.mockResolvedValue([{ id: "milestone-1", name: "Submit application", dueDate: day("2026-07-15"), goalId: "goal-1", goal: { name: "Move house" } }]);
    mocks.customItemFindMany.mockResolvedValue([{ id: "item-1", name: "Passport renewal", dueDate: day("2026-07-20"), moduleId: "module-1", module: { name: "Books", icon: "star", color: "#111111" } }]);

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

/**
 * KD-017 Phase 3: collectNotifications no longer runs its own five queries,
 * each narrowed to just far enough ahead to matter (a year for documents,
 * each type's own lead time otherwise) -- it reads from the shared
 * getAttentionRecords (KD-017 Phase 1), which fetches every structurally
 * eligible record with no date narrowing at all, the same tradeoff already
 * made for every other consumer of that function. There is no query window
 * left to test here; whether a distant or near date produces a candidate is
 * exercised directly, without a database in between, in
 * tests/unit/notification-candidates.test.ts.
 */
