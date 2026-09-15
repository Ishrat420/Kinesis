import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  dismissalUpsert: vi.fn<(args: { where: unknown; create: Record<string, unknown> }) => unknown>(() => ({ __op: "upsert" })),
  notificationReadUpsert: vi.fn<(args: { where: unknown; create: Record<string, unknown> }) => unknown>(() => ({ __op: "markRead" })),
  documentFindFirst: vi.fn(),
  customItemFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    attentionDismissal: { upsert: mocks.dismissalUpsert },
    notificationRead: { upsert: mocks.notificationReadUpsert },
    document: { findFirst: mocks.documentFindFirst },
    customItem: { findFirst: mocks.customItemFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { dismissAttentionItem } from "@/app/actions";

const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** The arguments the dismissal row was written with, or undefined if none was. */
const written = () => mocks.dismissalUpsert.mock.calls[0]?.[0];

describe("dismissAttentionItem: only rows that offer a Dismiss button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.transaction.mockResolvedValue([]);
  });

  it("records a dismissal for an expired document", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:EXPIRED:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "document:document-1:EXPIRED:2026-06-01", documentId: "document-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("records a dismissal for an overdue custom item", async () => {
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("custom:item-1:CUSTOM_ITEM_DUE:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "custom:item-1:CUSTOM_ITEM_DUE:2026-06-01", customItemId: "item-1" });
  });

  it("records a dismissal for a document that is only expiring soon, not yet expired", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:REMINDER_DUE:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "document:document-1:REMINDER_DUE:2026-06-01", documentId: "document-1" });
  });

  it("refuses a milestone, which the card no longer offers to dismiss", async () => {
    await dismissAttentionItem("milestone:milestone-1:MILESTONE_DUE:2026-06-01");

    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(written()).toBeUndefined();
  });

  it("refuses a to-do, for the same reason -- it also gets Mark complete and Reschedule now", async () => {
    await dismissAttentionItem("todo:todo-1:TODO_DUE:2026-06-01");

    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(written()).toBeUndefined();
  });

  it("refuses a type that does not belong to the kind, even a real notification type", async () => {
    // CUSTOM_ITEM_DUE is real, but never means anything for a document.
    await dismissAttentionItem("document:document-1:CUSTOM_ITEM_DUE:2026-06-01");

    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(written()).toBeUndefined();
  });

  it("refuses a legacy key carrying no type or deadline", async () => {
    await dismissAttentionItem("document:document-1");
    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(written()).toBeUndefined();
  });
});

describe("dismissAttentionItem: a dismissal is scoped to one deadline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.transaction.mockResolvedValue([]);
  });

  it("writes nothing when the date has already moved on", async () => {
    // The row the person clicked no longer exists at that deadline, so a
    // dismissal recorded against it would mean nothing.
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-07-01") });

    await dismissAttentionItem("document:document-1:EXPIRED:2026-06-01");

    expect(written()).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("writes nothing when the date has been cleared entirely", async () => {
    // Without a date the item cannot be overdue, so it leaves Needs Attention
    // on its own terms and has nothing to dismiss.
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: null });

    await dismissAttentionItem("custom:item-1:CUSTOM_ITEM_DUE:2026-06-01");

    expect(written()).toBeUndefined();
  });

  it("writes nothing when the record is gone or belongs to someone else", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);

    await dismissAttentionItem("document:document-1:EXPIRED:2026-06-01");

    expect(written()).toBeUndefined();
  });

  it("scopes the lookup to the signed-in owner", async () => {
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("custom:item-1:CUSTOM_ITEM_DUE:2026-06-01");

    expect(mocks.customItemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1", module: { userId: "owner-id" } } }),
    );
  });

  it("keys the row on the deadline, so a later date is a separate dismissal", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-07-01") });

    await dismissAttentionItem("document:document-1:EXPIRED:2026-07-01");

    expect(written()?.where).toEqual({
      userId_itemKey: { userId: "owner-id", itemKey: "document:document-1:EXPIRED:2026-07-01" },
    });
  });
});

describe("dismissAttentionItem: dismissing also quiets the bell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: "owner-id" });
    mocks.transaction.mockResolvedValue([]);
  });

  /**
   * The bell derives what it shows, so there is no row to update -- there is a
   * read marker to write, naming the exact notice the dismissed key itself
   * named -- not derived independently, so it can never disagree with it.
   */
  it("writes a read marker naming the notification, in the same transaction", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:EXPIRED:2026-06-01");

    expect(mocks.notificationReadUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_itemKey: { userId: "owner-id", itemKey: "document:document-1:EXPIRED:2026-06-01" } },
      create: expect.objectContaining({ itemKey: "document:document-1:EXPIRED:2026-06-01", documentId: "document-1" }),
    });
    // Hiding the row and quieting the bell are one act, not two that can
    // half-apply.
    expect(mocks.transaction).toHaveBeenCalledWith([{ __op: "upsert" }, { __op: "markRead" }]);
  });

  it("names the right notification for a custom item", async () => {
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("custom:item-1:CUSTOM_ITEM_DUE:2026-06-01");

    expect(mocks.notificationReadUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: expect.objectContaining({ itemKey: "custom:item-1:CUSTOM_ITEM_DUE:2026-06-01", customItemId: "item-1" }),
    });
  });

  /**
   * The exact bug this whole file exists to catch: dismissing while a
   * document is only "expiring soon" used to always mark its *overdue*
   * notification read (the type was hardcoded, never read from the key
   * actually dismissed) -- so once the document genuinely expired, its bell
   * notification was already silenced before it ever fired. The read marker
   * must name the advance notice here, not the overdue one it hasn't reached
   * yet.
   */
  it("quiets only the advance reminder when only the advance notice was dismissed, not the eventual overdue one", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:REMINDER_DUE:2026-06-01");

    expect(mocks.notificationReadUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: expect.objectContaining({ itemKey: "document:document-1:REMINDER_DUE:2026-06-01" }),
    });
  });

  it("touches no notification when the dismissal is refused", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-07-01") });

    await dismissAttentionItem("document:document-1:EXPIRED:2026-06-01");

    expect(mocks.notificationReadUpsert).not.toHaveBeenCalled();
  });
});
