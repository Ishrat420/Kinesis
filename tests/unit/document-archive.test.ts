import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  settingsFindUnique: vi.fn(async (): Promise<unknown> => null),
  goalFindMany: vi.fn(async (): Promise<unknown[]> => []),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  importantDateFindMany: vi.fn(async (): Promise<unknown[]> => []),
  practiceFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  dismissalFindMany: vi.fn(async (): Promise<unknown[]> => []),
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
    milestone: { findMany: mocks.milestoneFindMany },
    todo: { findMany: mocks.todoFindMany },
    attentionDismissal: { findMany: mocks.dismissalFindMany },
  },
}));

import { ARCHIVED_STATUS, getDocumentState } from "@/lib/documents/expiry";
import { getCalendarItems } from "@/lib/data/calendar";
import { getNeedsAttention } from "@/lib/data/attention";
import { getUpcomingAndDue } from "@/lib/data/upcoming";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const NOW = at("2026-07-01");

/** Expired months ago, and well inside its own reminder period before that. */
const lapsed = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  name: "Passport",
  type: "Passport",
  expiryDate: at("2026-03-01"),
  prompt: 180,
  archived: false,
  ...overrides,
});

/** The `where` a data reader actually sent, so the filter is asserted once. */
const whereOf = (mock: { mock: { calls: unknown[][] } }) =>
  (mock.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireKinesisUser.mockResolvedValue({ id: "user-1" });
  mocks.settingsFindUnique.mockResolvedValue(null);
  mocks.goalFindMany.mockResolvedValue([]);
  mocks.documentFindMany.mockResolvedValue([]);
  mocks.importantDateFindMany.mockResolvedValue([]);
  mocks.practiceFindMany.mockResolvedValue([]);
  mocks.customItemFindMany.mockResolvedValue([]);
  mocks.milestoneFindMany.mockResolvedValue([]);
  mocks.todoFindMany.mockResolvedValue([]);
  mocks.dismissalFindMany.mockResolvedValue([]);
});

describe("getDocumentState: what an archived document reports", () => {
  it("reads Archived rather than the status its date would give it", () => {
    // Expired six months ago: without archiving this is unambiguously "Expired".
    const state = getDocumentState(lapsed({ archived: true }), NOW);
    expect(state.status).toBe(ARCHIVED_STATUS);
    expect(state.urgency).toBe("archived");
  });

  it("does not count down to an expiry that will never be raised", () => {
    // The label is what the page shows beside the expiry date. A countdown
    // there would promise a reminder that archiving has switched off.
    expect(getDocumentState(lapsed({ archived: true }), NOW).label).toBe(ARCHIVED_STATUS);
  });

  it("archives a document that has no expiry date at all", () => {
    const state = getDocumentState({ expiryDate: null, prompt: 180, archived: true }, NOW);
    expect(state.status).toBe(ARCHIVED_STATUS);
  });

  it("leaves an unarchived document reading exactly as it did before", () => {
    expect(getDocumentState(lapsed(), NOW).status).toBe("Expired");
    expect(getDocumentState(lapsed({ expiryDate: at("2026-08-01") }), NOW).status).toBe("Expiring soon");
    expect(getDocumentState(lapsed({ expiryDate: at("2027-08-01") }), NOW).status).toBe("Active");
  });

  it("treats a document with no archived field as not archived", () => {
    // Rows read with a narrow `select` do not always carry the column.
    expect(getDocumentState({ expiryDate: at("2026-03-01"), prompt: 180 }, NOW).status).toBe("Expired");
  });
});

describe("an archived document leaves the reminder cycle", () => {
  it("is not read by Needs Attention", async () => {
    await getNeedsAttention(NOW);
    expect(whereOf(mocks.documentFindMany)).toMatchObject({ userId: "user-1", archived: false });
  });

  it("is not read by Upcoming & Due", async () => {
    await getUpcomingAndDue(NOW);
    expect(whereOf(mocks.documentFindMany)).toMatchObject({ userId: "user-1", archived: false });
  });

  it("is not read by the calendar", async () => {
    await getCalendarItems(at("2026-03-01"), at("2026-03-31"));
    expect(whereOf(mocks.documentFindMany)).toMatchObject({ userId: "user-1", archived: false });
  });

  it("takes its expiry and reminder pins off the calendar with it", async () => {
    // The query filters archived rows out, so an archived document reaches the
    // pin-building code as no row at all -- both of its pins go together.
    mocks.documentFindMany.mockResolvedValue([]);
    const items = await getCalendarItems(at("2026-03-01"), at("2026-03-31"));
    expect(items).toEqual([]);
  });

  it("still pins an unarchived document, so the filter has not caught everything", async () => {
    mocks.documentFindMany.mockResolvedValue([{ ...lapsed(), customFields: [] }]);
    const items = await getCalendarItems(at("2026-03-01"), at("2026-03-31"));
    expect(items.map((item) => item.title)).toContain("Passport expires");
  });
});
