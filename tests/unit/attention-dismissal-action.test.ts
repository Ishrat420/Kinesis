import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKinesisUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  dismissalUpsert: vi.fn<(args: { where: unknown; create: Record<string, unknown> }) => unknown>(() => ({ __op: "upsert" })),
  notificationReadUpsert: vi.fn<(args: { where: unknown; create: Record<string, unknown> }) => unknown>(() => ({ __op: "markRead" })),
  documentFindFirst: vi.fn(),
  customItemFindFirst: vi.fn(),
  todoFindFirst: vi.fn(),
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
    todo: { findFirst: mocks.todoFindFirst },
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

    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "document:document-1:2026-06-01", documentId: "document-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("records a dismissal for an overdue custom item", async () => {
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("custom:item-1:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "custom:item-1:2026-06-01", customItemId: "item-1" });
  });

  it("records a dismissal for an overdue to-do, which used to fail in silence", async () => {
    // The card rendered the button, the row vanished optimistically, and the
    // server rejected the key without a word -- so it came back on reload.
    mocks.todoFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("todo:todo-1:2026-06-01");

    expect(written()?.create).toMatchObject({ itemKey: "todo:todo-1:2026-06-01", todoId: "todo-1" });
  });

  it("refuses a milestone, which the card no longer offers to dismiss", async () => {
    await dismissAttentionItem("milestone:milestone-1:2026-06-01");

    expect(mocks.requireKinesisUser).not.toHaveBeenCalled();
    expect(written()).toBeUndefined();
  });

  it("refuses a legacy key carrying no deadline", async () => {
    await dismissAttentionItem("document:document-1");

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

    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(written()).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("writes nothing when the date has been cleared entirely", async () => {
    // Without a date the item cannot be overdue, so it leaves Needs Attention
    // on its own terms and has nothing to dismiss.
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: null });

    await dismissAttentionItem("custom:item-1:2026-06-01");

    expect(written()).toBeUndefined();
  });

  it("writes nothing when the record is gone or belongs to someone else", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);

    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(written()).toBeUndefined();
  });

  it("scopes the lookup to the signed-in owner", async () => {
    mocks.todoFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem("todo:todo-1:2026-06-01");

    expect(mocks.todoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "todo-1", userId: "owner-id" } }),
    );
  });

  it("keys the row on the deadline, so a later date is a separate dismissal", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-07-01") });

    await dismissAttentionItem("document:document-1:2026-07-01");

    expect(written()?.where).toEqual({
      userId_itemKey: { userId: "owner-id", itemKey: "document:document-1:2026-07-01" },
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
   * read marker to write, named after the notification it silences. An overdue
   * document is always saying the same thing, so the key can be built outright
   * rather than derived, which is what keeps this a single write.
   */
  it("writes a read marker naming the notification, in the same transaction", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(mocks.notificationReadUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_itemKey: { userId: "owner-id", itemKey: "document:document-1:EXPIRED:2026-06-01" } },
      create: expect.objectContaining({ itemKey: "document:document-1:EXPIRED:2026-06-01", documentId: "document-1" }),
    });
    // Hiding the row and quieting the bell are one act, not two that can
    // half-apply.
    expect(mocks.transaction).toHaveBeenCalledWith([{ __op: "upsert" }, { __op: "markRead" }]);
  });

  it.each([
    ["a to-do", "todo:todo-1:2026-06-01", "todo:todo-1:TODO_DUE:2026-06-01", "todoId", "todo-1"],
    ["a custom item", "custom:item-1:2026-06-01", "custom:item-1:CUSTOM_ITEM_DUE:2026-06-01", "customItemId", "item-1"],
  ])("names the right notification for %s", async (_label, dismissalKey, readKey, link, id) => {
    mocks.todoFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });
    mocks.customItemFindFirst.mockResolvedValue({ dueDate: at("2026-06-01") });

    await dismissAttentionItem(dismissalKey);

    expect(mocks.notificationReadUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: expect.objectContaining({ itemKey: readKey, [link]: id }),
    });
  });

  /**
   * The two keys look alike and mean different things: a dismissal is only ever
   * about something overdue, while a notification also has an advance form that
   * is read separately. Sharing one key would let dismissing an overdue item
   * silently mark its earlier reminder read as well.
   */
  it("does not reuse the dismissal's own key as the read marker", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-06-01") });

    await dismissAttentionItem("document:document-1:2026-06-01");

    const dismissal = written()?.create.itemKey;
    const read = (mocks.notificationReadUpsert.mock.calls[0]?.[0].create as { itemKey: string }).itemKey;
    expect(dismissal).toBe("document:document-1:2026-06-01");
    expect(read).not.toBe(dismissal);
  });

  it("touches no notification when the dismissal is refused", async () => {
    mocks.documentFindFirst.mockResolvedValue({ expiryDate: at("2026-07-01") });

    await dismissAttentionItem("document:document-1:2026-06-01");

    expect(mocks.notificationReadUpsert).not.toHaveBeenCalled();
  });
});
