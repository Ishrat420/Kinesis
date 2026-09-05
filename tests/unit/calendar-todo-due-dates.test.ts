import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  goalFindMany: vi.fn(async (): Promise<unknown[]> => []),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  practiceFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
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
    todo: { findMany: mocks.todoFindMany },
  },
}));

import { getCalendarItems } from "@/lib/data/calendar";
import { ALL_CALENDAR_SOURCES, CALENDAR_SOURCE_LABELS, DEFAULT_CALENDAR_SOURCES } from "@/lib/calendar/filters";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const july = [at("2026-07-01"), new Date("2026-07-31T23:59:59.999Z")] as const;

const todo = (overrides: Record<string, unknown> = {}) => ({
  id: "todo-1",
  name: "Renew car insurance",
  dueDate: at("2026-07-15"),
  status: "TODO",
  ...overrides,
});

const todoItems = async () =>
  (await getCalendarItems(july[0], july[1])).filter((item) => item.sourceType === "TODO");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "user-1" });
  mocks.settingsFindUnique.mockResolvedValue(null);
  mocks.goalFindMany.mockResolvedValue([]);
  mocks.documentFindMany.mockResolvedValue([]);
  mocks.importantDateFindMany.mockResolvedValue([]);
  mocks.practiceFindMany.mockResolvedValue([]);
  mocks.customItemFindMany.mockResolvedValue([]);
  mocks.todoFindMany.mockResolvedValue([]);
});

describe("a dated To-Do on the calendar", () => {
  it("pins the due date, worded the way every other due date is", () => {
    mocks.todoFindMany.mockResolvedValue([todo()]);

    return todoItems().then(([item]) => {
      expect(item.title).toBe("Renew car insurance due");
      expect(item.date).toBe("2026-07-15");
    });
  });

  it("renders as a plain dated pin, so it takes the same colour as other due dates", async () => {
    mocks.todoFindMany.mockResolvedValue([todo()]);

    // The pill's violet is chosen by kind, and only a REMINDER source breaks
    // out of that -- a due date must be neither, or it reads as a lead-up.
    const [item] = await todoItems();
    expect(item.kind).toBe("DATED");
    expect(item.sourceType).not.toBe("REMINDER");
  });

  it("links to the to-do itself, not just to the list it sits in", async () => {
    mocks.todoFindMany.mockResolvedValue([todo({ id: "abc" })]);

    // The board gives every row this anchor, and search and the object layer
    // already address a To-Do by it.
    const [item] = await todoItems();
    expect(item.href).toBe("/todos#todo-abc");
  });

  it("names the module it came from, so the preview footer reads like the others", async () => {
    mocks.todoFindMany.mockResolvedValue([todo()]);

    const [item] = await todoItems();
    expect(item.sourceModule).toBe("To-Dos");
    expect(item.detail).toBe("To-do due date");
  });

  it("keeps a completed to-do's pin, relabelled rather than removed", async () => {
    mocks.todoFindMany.mockResolvedValue([todo({ status: "DONE" })]);

    // Same rule a completed milestone follows: the calendar records when the
    // deadline fell, and finishing the work does not unmake that date.
    const [item] = await todoItems();
    expect(item.detail).toBe("Completed to-do");
    expect(item.date).toBe("2026-07-15");
  });

  it("keeps a waiting to-do pinned as an ordinary due date", async () => {
    mocks.todoFindMany.mockResolvedValue([todo({ status: "WAITING" })]);

    expect((await todoItems())[0].detail).toBe("To-do due date");
  });

  it("asks the database only for to-dos that have a due date", async () => {
    await todoItems();

    const [query] = mocks.todoFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(query.where).toMatchObject({ userId: "user-1", dueDate: { not: null } });
  });

  it("drops a to-do whose due date falls outside the month being viewed", async () => {
    mocks.todoFindMany.mockResolvedValue([todo({ dueDate: at("2026-09-02") })]);

    expect(await todoItems()).toEqual([]);
  });

  it("adds no lead-up pin, since a to-do has no reminder window", async () => {
    mocks.todoFindMany.mockResolvedValue([todo()]);

    const items = await getCalendarItems(july[0], july[1]);
    expect(items.filter((item) => item.sourceType === "REMINDER")).toEqual([]);
    expect(items).toHaveLength(1);
  });
});

describe("the To-Do source in the calendar's filter panel", () => {
  it("is offered as a source of its own", () => {
    expect(ALL_CALENDAR_SOURCES).toContain("TODO");
    expect(CALENDAR_SOURCE_LABELS.TODO).toBe("To-Dos");
  });

  it("is shown by default, the way every source but reminders is", () => {
    expect(DEFAULT_CALENDAR_SOURCES).toContain("TODO");
  });
});
