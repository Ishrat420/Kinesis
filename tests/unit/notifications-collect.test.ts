import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  readFindMany: vi.fn(async (): Promise<unknown[]> => []),
  firstSeenFindMany: vi.fn(async (): Promise<unknown[]> => []),
  firstSeenCreateMany: vi.fn(async () => ({ count: 0 })),
  goalFindMany: vi.fn(async (): Promise<unknown[]> => []),
  goalUpdateMany: vi.fn(async () => ({ count: 0 })),
  userFindUnique: vi.fn(async (): Promise<unknown> => null),
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
    notificationFirstSeen: { findMany: mocks.firstSeenFindMany, createMany: mocks.firstSeenCreateMany },
    goal: { findMany: mocks.goalFindMany, updateMany: mocks.goalUpdateMany },
    user: { findUnique: mocks.userFindUnique },
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
  for (const query of [mocks.documentFindMany, mocks.milestoneFindMany, mocks.importantDateFindMany, mocks.customItemFindMany, mocks.todoFindMany, mocks.readFindMany, mocks.firstSeenFindMany]) {
    query.mockResolvedValue([]);
  }
  mocks.firstSeenCreateMany.mockResolvedValue({ count: 0 });
});

describe("collecting derives the notification itself; only when it was first seen is recorded", () => {
  it("writes nothing to NotificationRead -- only reads it", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    await collectNotifications("user-1", NOW);

    expect(mocks.readFindMany).toHaveBeenCalledTimes(1);
  });

  /**
   * The fix this whole file's "ordering follows when each notification first
   * reached the owner" describe block below exists to pin: a notification
   * needs its own record of when it first appeared, because nothing else
   * derivable means that -- see NotificationFirstSeen in the schema and
   * lib/notifications/engine.ts's byRecency.
   */
  it("records the first-seen instant for a notification no one has derived before", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);

    await collectNotifications("user-1", NOW);

    expect(mocks.firstSeenCreateMany).toHaveBeenCalledTimes(1);
    const [{ data }] = mocks.firstSeenCreateMany.mock.calls[0] as unknown as [{ data: { itemKey: string; firstSeenAt: Date }[] }];
    expect(data).toEqual([expect.objectContaining({ itemKey: "document:doc-1:EXPIRED:2026-03-01", firstSeenAt: NOW })]);
  });

  it("never re-records a key that already has a first-seen row -- first seen means first, not most recent", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    mocks.firstSeenFindMany.mockResolvedValue([{ itemKey: "document:doc-1:EXPIRED:2026-03-01", firstSeenAt: day("2026-03-01") }]);

    await collectNotifications("user-1", NOW);

    expect(mocks.firstSeenCreateMany).not.toHaveBeenCalled();
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

    // Order isn't the point here (that's the describe block below) -- both
    // being newly seen in the same request ties them on firstSeenAt, so
    // which sorts first is whatever byUrgency's tiebreak says.
    const collected = await collectNotifications("user-1", NOW);

    expect(collected.map(({ type }) => type).sort()).toEqual(["CUSTOM_ITEM_DUE", "MILESTONE_DUE"]);
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

describe("ordering follows when each notification first reached the owner", () => {
  /**
   * The bug this replaced triggeredAt-based ordering to fix: a brand-new
   * document with a short runway to its deadline has an old reminder-window
   * date (expiry minus however long a prompt), so sorting by that date put
   * it at the bottom the moment it first appeared -- exactly backwards from
   * an inbox, where the thing that just arrived belongs on top regardless of
   * what it's about.
   */
  it("puts a brand-new notification on top, even though its deadline-derived date is old", async () => {
    // doc-1 (Passport) expired back on 1 March -- an old date to derive from,
    // but there is no NotificationFirstSeen row for it at all: this is the
    // first time anything has ever asked about it. todo-1 was already seen
    // on 1 June, nearly a month before "now".
    mocks.documentFindMany.mockResolvedValue(expiredPassport);
    mocks.todoFindMany.mockResolvedValue([{ id: "todo-1", name: "Renew rego", dueDate: day("2026-06-01"), status: "TODO" }]);
    mocks.firstSeenFindMany.mockResolvedValue([{ itemKey: "todo:todo-1:TODO_DUE:2026-06-01", firstSeenAt: day("2026-06-01") }]);

    expect((await collectNotifications("user-1", NOW)).map(({ sourceId }) => sourceId))
      .toEqual(["doc-1", "todo-1"]);
  });

  it("orders two already-seen notifications by which was first seen more recently, ignoring their deadlines", async () => {
    // doc-1 (Passport) expired back on 1 March, doc-2 (Licence) isn't due
    // until 1 August -- the far-later deadline -- but doc-1 only reached the
    // owner on 20 June, after doc-2 (10 June).
    mocks.documentFindMany.mockResolvedValue([...expiringLicence, ...expiredPassport]);
    mocks.firstSeenFindMany.mockResolvedValue([
      { itemKey: "document:doc-1:EXPIRED:2026-03-01", firstSeenAt: day("2026-06-20") },
      { itemKey: "document:doc-2:REMINDER_DUE:2026-08-01", firstSeenAt: day("2026-06-10") },
    ]);

    expect((await collectNotifications("user-1", NOW)).map(({ sourceId }) => sourceId))
      .toEqual(["doc-1", "doc-2"]);
  });

  /**
   * Two notifications can only ever tie on the exact same firstSeenAt
   * instant when both are new in the very same request (real timestamps, so
   * an actual tie needs the same read to have created both). Which one wins
   * genuinely doesn't matter -- byUrgency (the deadline-based comparator
   * that used to be the primary sort) still breaks it, only so the order
   * stays stable rather than depending on array order.
   */
  it("breaks a tie between two notifications first seen at the same instant, consistently", async () => {
    const sameInstant = [
      { id: "doc-a", name: "A", type: "T", expiryDate: day("2026-03-01"), prompt: 180, archived: false },
      { id: "doc-b", name: "B", type: "T", expiryDate: day("2026-04-01"), prompt: 180, archived: false },
    ];
    mocks.documentFindMany.mockResolvedValue(sameInstant);
    mocks.firstSeenFindMany.mockResolvedValue([
      { itemKey: "document:doc-a:EXPIRED:2026-03-01", firstSeenAt: NOW },
      { itemKey: "document:doc-b:EXPIRED:2026-04-01", firstSeenAt: NOW },
    ]);
    const first = (await collectNotifications("user-1", NOW)).map(({ key }) => key);
    mocks.documentFindMany.mockResolvedValue([...sameInstant].reverse());
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
