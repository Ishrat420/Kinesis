import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    userSettings: { findUnique: mocks.settingsFindUnique },
    milestone: { findMany: mocks.milestoneFindMany },
  },
}));

import { getMilestonesDueSoon } from "@/lib/data/goals";
import { activeGoalWhere } from "@/lib/goals/active";
import { milestoneDueSoonWindow, milestoneLists } from "@/lib/goals/milestone-window";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const now = at("2026-06-15");

const milestone = (name: string, dueDate: string | null) => ({ id: name, name, completed: false, dueDate: dueDate ? at(dueDate) : null });
const names = (milestones: { name: string }[]) => milestones.map((item) => item.name);

/** The where clause the tile's query was built with. */
async function tileQuery(leadDays: number) {
  mocks.settingsFindUnique.mockResolvedValue({ milestoneReminderLeadDays: leadDays });
  await getMilestonesDueSoon(now);
  return mocks.milestoneFindMany.mock.calls[0][0] as {
    where: { completed: boolean; dueDate: { gte: Date; lte: Date }; goal: { userId: string; status: string } };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
  mocks.settingsFindUnique.mockResolvedValue(null);
  mocks.milestoneFindMany.mockResolvedValue([]);
});

/**
 * The tile counts with a query and the page filters in memory. They are two
 * pieces of code answering one question, which is exactly how they drifted
 * apart: the tile counted a 30-day window and "See all" listed every
 * incomplete milestone, undated ones included, so the number never matched
 * the list. Both now go through `milestoneDueSoonWindow`, and these hold them
 * to the same answer.
 */
describe("the dashboard tile's count and the page's filtered list describe one set", () => {
  it("queries exactly the window the page filters by", async () => {
    const { where } = await tileQuery(30);
    const window = milestoneDueSoonWindow(now, 30);

    expect(where.dueDate.gte.toISOString()).toBe(window.from.toISOString());
    expect(where.dueDate.lte.toISOString()).toBe(window.to.toISOString());
  });

  it("follows the configured lead rather than a hardcoded month", async () => {
    const { where } = await tileQuery(7);

    expect(where.dueDate.gte.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(where.dueDate.lte.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });

  it("falls back to the default lead when there is no settings row", async () => {
    mocks.settingsFindUnique.mockResolvedValue(null);
    await getMilestonesDueSoon(now);
    const { where } = mocks.milestoneFindMany.mock.calls[0][0] as { where: { dueDate: { lte: Date } } };

    expect(where.dueDate.lte).toEqual(milestoneDueSoonWindow(now, 30).to);
  });

  it("counts only incomplete milestones on an active goal, which the page's source query also does", async () => {
    const { where } = await tileQuery(30);

    expect(where.completed).toBe(false);
    // "Active" is asked of the target date as well as the column: a goal whose
    // target date has passed is archived whether or not the column says so yet.
    expect(where.goal).toEqual({ userId: "owner-id", ...activeGoalWhere(now) });
  });

  it("selects the same milestones the filtered page renders", async () => {
    const all = [
      milestone("Due today", "2026-06-15"),
      milestone("Due inside the window", "2026-07-01"),
      milestone("Due on the last day", "2026-07-15"),
      milestone("Due beyond the window", "2026-09-01"),
      milestone("No due date", null),
      milestone("Overdue", "2026-06-01"),
    ];
    const { where } = await tileQuery(30);
    // What the database would return for that query, applied by hand.
    const counted = all.filter((item) => item.dueDate && item.dueDate >= where.dueDate.gte && item.dueDate <= where.dueDate.lte);
    const listed = milestoneLists(all, at("2026-06-15"), milestoneDueSoonWindow(now, 30), true).upcoming;

    expect(names(listed)).toEqual(names(counted));
    expect(listed).toHaveLength(3);
  });

  it("shows more than the tile counted once the filter is removed, which is the point of removing it", async () => {
    const all = [milestone("Due beyond the window", "2026-09-01"), milestone("No due date", null)];
    const { where } = await tileQuery(30);
    const counted = all.filter((item) => item.dueDate && item.dueDate >= where.dueDate.gte && item.dueDate <= where.dueDate.lte);
    const listed = milestoneLists(all, at("2026-06-15"), milestoneDueSoonWindow(now, 30), false).upcoming;

    expect(counted).toEqual([]);
    expect(names(listed)).toEqual(["Due beyond the window", "No due date"]);
  });
});
