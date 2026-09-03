import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  goalFindMany: vi.fn(async (): Promise<unknown[]> => []),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  practiceFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  notificationFindMany: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    userSettings: { findUnique: mocks.settingsFindUnique },
    goal: { findMany: mocks.goalFindMany },
    document: { findMany: mocks.documentFindMany },
    relationshipImportantDate: { findMany: mocks.importantDateFindMany },
    connectionPractice: { findMany: mocks.practiceFindMany },
    customItem: { findMany: mocks.customItemFindMany },
    notification: { findMany: mocks.notificationFindMany },
  },
}));

import { getCalendarItems } from "@/lib/data/calendar";
import type { KinesisCalendarItem } from "@/lib/calendar/types";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999Z`);

/** A month of the grid, the way the calendar page asks for one. */
const month = (start: string, end: string) => [at(start), endOf(end)] as const;
const items = (window: readonly [Date, Date]) => getCalendarItems(window[0], window[1]);
const reminders = async (window: readonly [Date, Date]) =>
  (await items(window)).filter((item) => item.sourceType === "REMINDER");
const pin = (item: KinesisCalendarItem) => `${item.date} ${item.title}`;

const settings = (overrides: Record<string, unknown> = {}) => ({
  locale: "en-AU",
  currency: "AUD",
  notificationsEnabled: true,
  remindersEnabled: true,
  milestoneReminderLeadDays: 30,
  relationshipReminderLeadDays: 30,
  customItemReminderLeadDays: 30,
  ...overrides,
});

const document = (expiryDate: string, prompt = 30) => [{
  id: "document-1", name: "Passport", type: "Identity", expiryDate: at(expiryDate), prompt, customFields: [],
}];

const milestoneGoal = (dueDate: string, overrides: { completed?: boolean; status?: string } = {}) => [{
  id: "goal-1", name: "Move house", status: overrides.status ?? "Active", targetDate: null,
  milestones: [{ id: "milestone-1", name: "Submit application", dueDate: at(dueDate), completed: overrides.completed ?? false }],
}];

const importantDate = (date: string, repeatsYearly = true) => [{
  id: "important-1", label: "Alice's birthday", date: at(date), repeatsYearly, relationshipId: "relationship-1", selfPersonId: null,
}];

const customItem = (dueDate: string) => [{
  id: "custom-1", name: "Service the car", dueDate: at(dueDate), moduleId: "module-1", module: { name: "Car" }, fields: [],
}];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  // clearAllMocks forgets calls, not resolved values: every source goes back to
  // empty so one test's fixture cannot leak into the next.
  mocks.settingsFindUnique.mockResolvedValue(settings());
  mocks.goalFindMany.mockResolvedValue([]);
  mocks.documentFindMany.mockResolvedValue([]);
  mocks.importantDateFindMany.mockResolvedValue([]);
  mocks.practiceFindMany.mockResolvedValue([]);
  mocks.customItemFindMany.mockResolvedValue([]);
  mocks.notificationFindMany.mockResolvedValue([]);
});

/**
 * The bug this whole change exists for. A Notification row is only written once
 * `today >= reminderAt` and deleted again afterwards, so every stored reminder
 * is in the past -- a calendar reading them could never pin one ahead of time.
 */
describe("a reminder appears on the calendar before it fires", () => {
  it("pins a document's lead-up in a month that has not happened yet", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Passport reminder"]);
  });

  it("pins a milestone's lead-up ahead of time", async () => {
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-15"));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Submit application reminder"]);
  });

  it("pins a custom item's lead-up ahead of time", async () => {
    mocks.customItemFindMany.mockResolvedValue(customItem("2027-01-15"));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Service the car reminder"]);
  });

  it("pins an important date's lead-up ahead of time", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-01-15"));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Alice's birthday reminder"]);
  });

  it("leaves the Reminders filter with something to show in any future month, which was the visible symptom", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2029-08-20", 30));

    expect((await reminders(month("2029-07-01", "2029-07-31"))).map(pin)).toEqual(["2029-07-21 Passport reminder"]);
  });

  it("reads no notification row to do it, so a pin never waits on the engine having run", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-15"));

    expect(await reminders(month("2026-12-01", "2026-12-31"))).toHaveLength(2);
    expect(mocks.notificationFindMany).not.toHaveBeenCalled();
  });

  it("moves the pin the moment a lead setting changes, with no reconcile in between", async () => {
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-15"));
    mocks.settingsFindUnique.mockResolvedValue(settings({ milestoneReminderLeadDays: 60 }));

    expect((await reminders(month("2026-11-01", "2026-11-30"))).map(pin)).toEqual(["2026-11-16 Submit application reminder"]);
  });

  it("falls back to the default lead when a person has no settings row at all", async () => {
    mocks.settingsFindUnique.mockResolvedValue(null);
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-15"));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Submit application reminder"]);
  });
});

describe("a pin is described by the deadline it warns about", () => {
  it("is a whole-day DATED item under the Reminders source", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    const [reminder] = await reminders(month("2026-12-01", "2026-12-31"));
    expect(reminder).toMatchObject({ id: "document-reminder-document-1", kind: "DATED", sourceType: "REMINDER", href: "/documents/document-1" });
    expect(reminder.startTime).toBeUndefined();
  });

  it("states the deadline as a date rather than the countdown a notification would carry", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect((await reminders(month("2026-12-01", "2026-12-31")))[0].detail).toBe("Reminder for Passport · expires 15 Jan 2027");
  });

  it("writes that date in the person's locale", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ locale: "en-US" }));
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect((await reminders(month("2026-12-01", "2026-12-31")))[0].detail).toBe("Reminder for Passport · expires Jan 15, 2027");
  });
});

describe("a document's lead is the calendar period its prompt names", () => {
  it("counts 3 months back, not 90 days", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2026-05-31", 90));

    expect((await reminders(month("2026-02-01", "2026-02-28"))).map(pin)).toEqual(["2026-02-28 Passport reminder"]);
  });

  it("counts 6 months back", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2026-08-31", 180));

    expect((await reminders(month("2026-02-01", "2026-02-28"))).map(pin)).toEqual(["2026-02-28 Passport reminder"]);
  });

  it("counts a year back", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-03-15", 365));

    expect((await reminders(month("2026-03-01", "2026-03-31"))).map(pin)).toEqual(["2026-03-15 Passport reminder"]);
  });
});

/**
 * A pin is only honest if a reminder really will fire on it. Every state the
 * engine reconciles a reminder away in has to take the pin with it.
 */
describe("no pin for a reminder that will never fire", () => {
  it("drops every pin when reminders are switched off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-15"));
    mocks.customItemFindMany.mockResolvedValue(customItem("2027-01-15"));
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-01-15"));

    expect(await reminders(month("2026-12-01", "2026-12-31"))).toEqual([]);
  });

  it("drops every pin when notifications are switched off entirely", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ notificationsEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect(await reminders(month("2026-12-01", "2026-12-31"))).toEqual([]);
  });

  it("keeps the deadlines themselves visible when reminders are off", async () => {
    mocks.settingsFindUnique.mockResolvedValue(settings({ remindersEnabled: false }));
    mocks.documentFindMany.mockResolvedValue(document("2026-12-15", 30));

    expect((await items(month("2026-12-01", "2026-12-31"))).map((item) => item.title)).toEqual(["Passport expires"]);
  });

  it("drops a completed milestone's pin but keeps its due date", async () => {
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2026-12-20", { completed: true }));

    const results = await items(month("2026-11-01", "2026-12-31"));
    expect(results.map((item) => item.title)).toEqual(["Submit application due"]);
  });

  it("drops a pin for a milestone whose goal is no longer active", async () => {
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2026-12-20", { status: "Achieved" }));

    expect(await reminders(month("2026-11-01", "2026-12-31"))).toEqual([]);
  });

  it("still pins an active goal's unfinished milestone", async () => {
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2026-12-20"));

    expect((await reminders(month("2026-11-01", "2026-12-31"))).map(pin)).toEqual(["2026-11-20 Submit application reminder"]);
  });
});

/**
 * A pin sits a lead time before its deadline, so the two land in different
 * months more often than not. Each is tested against the window on its own date.
 */
describe("a pin and its deadline are windowed separately", () => {
  it("shows the pin in a month the deadline is not in", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect((await items(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-16 Passport reminder"]);
  });

  it("shows the deadline in a month the pin is not in", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));

    expect((await items(month("2027-01-01", "2027-01-31"))).map(pin)).toEqual(["2027-01-15 Passport expires"]);
  });

  it("shows both when a short lead keeps them in the same month", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2026-12-20", 5));

    expect((await items(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-15 Passport reminder", "2026-12-20 Passport expires"]);
  });

  it("includes a pin landing on the first day of the window", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2026-12-31", 30));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-01 Passport reminder"]);
  });

  it("includes a pin landing on the last day of the window", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-30", 30));

    expect((await reminders(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-31 Passport reminder"]);
  });

  it("excludes a pin one day past the end of the window", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-31", 30));

    expect(await reminders(month("2026-12-01", "2026-12-31"))).toEqual([]);
  });

  it("keeps a pin that has already passed, so history does not rewrite itself", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2020-07-01", 30));

    expect((await reminders(month("2020-06-01", "2020-06-30"))).map(pin)).toEqual(["2020-06-01 Passport reminder"]);
  });
});

describe("a yearly date is pinned at every occurrence, not only the next one", () => {
  it("pins next year's birthday as well as this year's", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-03-12"));

    expect((await reminders(month("2028-02-01", "2028-02-29"))).map(pin)).toEqual(["2028-02-11 Alice's birthday reminder"]);
  });

  it("gives each year's pin its own id, so two occurrences never collide", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-01-20"));

    const ids = (await reminders(month("2026-12-01", "2027-12-31"))).map((item) => item.id);
    expect(ids).toEqual(["relationship-reminder-important-1-2027", "relationship-reminder-important-1-2028"]);
  });

  it("pins an occurrence that falls just past the window, since its lead-up opens inside it", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-01-05"));

    // The occurrence is 5 January; only the 6 December lead-up is in view.
    expect((await items(month("2026-12-01", "2026-12-31"))).map(pin)).toEqual(["2026-12-06 Alice's birthday reminder"]);
  });

  it("pins a one-off date that has already passed, which the bell drops for good", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("2020-06-20", false));

    expect((await items(month("2020-05-01", "2020-06-30"))).map(pin)).toEqual(["2020-05-21 Alice's birthday reminder", "2020-06-20 Alice's birthday"]);
  });

  it("does not repeat a one-off date in later years", async () => {
    mocks.importantDateFindMany.mockResolvedValue(importantDate("2020-06-20", false));

    expect(await items(month("2026-05-01", "2026-06-30"))).toEqual([]);
  });
});

/**
 * Every item is rendered with `key={item.id}`, and pins doubled the number of
 * items a window holds -- a collision would silently drop one from the grid.
 */
describe("every item in a window carries its own id", () => {
  it("keeps pins, deadlines and repeat occurrences distinct across a year boundary", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2027-01-15", 30));
    mocks.goalFindMany.mockResolvedValue(milestoneGoal("2027-01-20"));
    mocks.customItemFindMany.mockResolvedValue(customItem("2026-12-28"));
    mocks.importantDateFindMany.mockResolvedValue(importantDate("1990-01-05"));

    const all = await items(month("2026-11-30", "2027-01-31"));
    const ids = all.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The 5 January occurrence and the 6 December lead-up that opens it, each
    // named for the occurrence's year rather than the day it is drawn on.
    expect(ids.filter((id) => id.startsWith("relationship-"))).toEqual([
      "relationship-reminder-important-1-2027",
      "relationship-date-important-1-2027",
    ]);
  });

  it("orders a pin before the deadline it warns about", async () => {
    mocks.documentFindMany.mockResolvedValue(document("2026-12-20", 5));

    expect((await items(month("2026-12-01", "2026-12-31"))).map((item) => item.sourceType)).toEqual(["REMINDER", "DOCUMENT"]);
  });
});
