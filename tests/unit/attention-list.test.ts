import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  documentFindMany: vi.fn(async (): Promise<unknown[]> => []),
  milestoneFindMany: vi.fn(async (): Promise<unknown[]> => []),
  customItemFindMany: vi.fn(async (): Promise<unknown[]> => []),
  todoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  dismissalFindMany: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    document: { findMany: mocks.documentFindMany },
    milestone: { findMany: mocks.milestoneFindMany },
    customItem: { findMany: mocks.customItemFindMany },
    todo: { findMany: mocks.todoFindMany },
    attentionDismissal: { findMany: mocks.dismissalFindMany },
  },
}));

import { getNeedsAttention } from "@/lib/data/attention";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = at("2026-06-15");

const expiredDocument = (expiryDate: string) => [{ id: "document-1", name: "Passport", expiryDate: at(expiryDate) }];
const overdueTodo = (dueDate: string) => [{ id: "todo-1", name: "Renew licence", status: "TODO", dueDate: at(dueDate) }];
const dismissed = (...keys: string[]) => keys.map((itemKey) => ({ itemKey }));

const titles = async () => (await getNeedsAttention(today)).map((item) => item.title);

describe("Needs Attention: a dismissal holds only while the deadline stands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    // clearAllMocks forgets calls, not resolved values: every source is put
    // back to empty so one test's fixture cannot leak into the next.
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.milestoneFindMany.mockResolvedValue([]);
    mocks.customItemFindMany.mockResolvedValue([]);
    mocks.todoFindMany.mockResolvedValue([]);
    mocks.dismissalFindMany.mockResolvedValue([]);
  });

  it("lists an expired document that has not been dismissed", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-01"));

    await expect(titles()).resolves.toEqual(["Passport"]);
  });

  it("hides it once dismissed at that expiry date", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-01"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1:2026-06-01"));

    await expect(titles()).resolves.toEqual([]);
  });

  it("keeps hiding it indefinitely while that date is unchanged", async () => {
    // No timer, no automatic expiry: the dismissal is permanent until the date
    // moves. A year later it still holds.
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-01"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1:2026-06-01"));

    const items = await getNeedsAttention(at("2027-06-15"));
    expect(items).toEqual([]);
  });

  it("shows it again once the expiry date is edited and lapses again", async () => {
    // The document was renewed to 10 June, which has now passed too. The
    // dismissal was recorded against 1 June and no longer applies.
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-10"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1:2026-06-01"));

    await expect(titles()).resolves.toEqual(["Passport"]);
  });

  it("shows it again when the date is merely corrected to another past date", async () => {
    // Editing the date is the signal, not whether the edit fixes anything.
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-05-20"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1:2026-06-01"));

    await expect(titles()).resolves.toEqual(["Passport"]);
  });

  it("honours a fresh dismissal recorded against the new date", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-10"));
    mocks.dismissalFindMany.mockResolvedValue(
      dismissed("document:document-1:2026-06-01", "document:document-1:2026-06-10"),
    );

    await expect(titles()).resolves.toEqual([]);
  });

  it("ignores a legacy dismissal that carries no deadline", async () => {
    // Rows written before dismissals were scoped can no longer hide anything.
    // The migration rewrites them; one that slipped through must not silently
    // suppress an expired document forever.
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-01"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1"));

    await expect(titles()).resolves.toEqual(["Passport"]);
  });

  it("hides a dismissed overdue to-do -- the dismissal that used to do nothing", async () => {
    mocks.todoFindMany.mockResolvedValue(overdueTodo("2026-06-01"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("todo:todo-1:2026-06-01"));

    await expect(titles()).resolves.toEqual([]);
  });

  it("shows the to-do again once its due date is edited and lapses again", async () => {
    mocks.todoFindMany.mockResolvedValue(overdueTodo("2026-06-05"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("todo:todo-1:2026-06-01"));

    await expect(titles()).resolves.toEqual(["Renew licence"]);
  });

  it("never hides another record that happens to share the deadline", async () => {
    mocks.documentFindMany.mockResolvedValue(expiredDocument("2026-06-01"));
    mocks.todoFindMany.mockResolvedValue(overdueTodo("2026-06-01"));
    mocks.dismissalFindMany.mockResolvedValue(dismissed("document:document-1:2026-06-01"));

    await expect(titles()).resolves.toEqual(["Renew licence"]);
  });
});
