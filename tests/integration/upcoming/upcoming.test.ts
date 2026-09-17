import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
// dismissAttentionItem (exercised by the dismiss tests below) revalidates "/"
// on success; there is no real Next.js request/render context in a plain
// vitest run for that to act on.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { dismissAttentionItem } from "@/app/actions";
import { dismissalKey } from "@/lib/attention/dismissal";
import { addUtcDays, startOfUtcDay } from "@/lib/dates";

/**
 * getUpcomingAndDue reads five unrelated tables against a per-type reminder
 * window computed from settings, and a relationship date additionally rolls
 * forward through a yearly-repeat calculation. None of that -- the window
 * math, the joins, the settings fallback -- is exercised by a mocked Prisma
 * client.
 */

const owner = "upcoming-owner";
const stranger = "upcoming-stranger";
// A fixed "now", with the owner's settings pinned to UTC so date-window
// arithmetic doesn't depend on the machine running the suite.
const now = new Date("2026-06-15T00:00:00.000Z");

async function seedSettings(userId: string, overrides: Record<string, unknown> = {}) {
  await prisma.userSettings.upsert({
    where: { userId },
    update: { timeZone: "UTC", ...overrides },
    create: { userId, timeZone: "UTC", ...overrides },
  });
}

describe.sequential("Upcoming & Due", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Upcoming", lastName: "Owner", email: "upcoming-owner@example.test" },
        { id: stranger, firstName: "S", lastName: "T", email: "upcoming-stranger@example.test" },
      ],
    });
    await seedSettings(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("surfaces a document within its reminder window, a due milestone, a due to-do, a relationship date, and a due custom item -- sorted soonest first", async () => {
    // Expires in 10 days, with the default 30-day prompt -- inside its window.
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2026-06-25"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2026-06-20") } });

    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: new Date("2026-06-10"), userId: owner, objectId: "todo-obj" } });

    await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
    await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
    await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: new Date("2026-06-30"), repeatsYearly: true } });

    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2026-06-22"), moduleId: "module-1", objectId: "item-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items.map((item) => item.kind)).toEqual(["todo", "milestone", "custom", "document", "relationship"]);
  });

  /**
   * Regression: items are sourced from one shared array (getAttentionRecords,
   * KD-017 Phase 1) rather than five separately concatenated ones, so a
   * same-day tie can no longer be left to whatever order that array happens
   * to list kinds in -- that order is an implementation detail, not a
   * contract, and it visibly changed once during this migration (custom
   * items moved ahead of to-dos and relationship dates). `id` gives the sort
   * a real, stable tiebreak that doesn't depend on it.
   */
  it("breaks a same-day tie deterministically by id, not by which kind's array happened to list it first", async () => {
    // Picked so the two orderings disagree: getAttentionRecords lists
    // milestones before custom items, but "custom-..." sorts before
    // "milestone-..." alphabetically. A sort that (still) relied on array
    // order would show the milestone first; this asserts the custom item
    // does, because id order is what the sort actually promises now.
    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2026-06-20") } });

    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2026-06-20"), moduleId: "module-1", objectId: "item-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items.map((item) => item.id)).toEqual(["custom-item-1", "milestone-milestone-1"]);
  });

  it("excludes a document whose reminder window hasn't opened yet", async () => {
    // Expires in 200 days, with only a 30-day prompt -- well outside its window.
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2027-01-01"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("still surfaces an expired document even with reminders disabled", async () => {
    await seedSettings(owner, { remindersEnabled: false });
    await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
    await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: new Date("2026-01-01"), prompt: 30, userId: owner, objectId: "doc-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items).toEqual([expect.objectContaining({ kind: "document", title: "Passport is expired" })]);
  });

  it("hides milestones, relationship dates, and custom items entirely once reminders are disabled", async () => {
    await seedSettings(owner, { remindersEnabled: false });
    await prisma.object.create({ data: { id: "goal-obj", type: "GOAL", name: "Read more", userId: owner } });
    await prisma.goal.create({ data: { id: "goal-1", name: "Read more", userId: owner, objectId: "goal-obj" } });
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-1", name: "Finish chapter 1", dueDate: new Date("2026-06-20") } });

    await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
    await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
    await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate: new Date("2026-06-22"), moduleId: "module-1", objectId: "item-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces an undated to-do, no matter how it's mapped", async () => {
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "No deadline", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "No deadline", userId: owner, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces a done to-do even if its due date has passed", async () => {
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Finished", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Finished", dueDate: new Date("2026-06-01"), status: "DONE", userId: owner, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("surfaces a to-do inside its configured lead window as due soon (KD-027)", async () => {
    await seedSettings(owner, { todoReminderLeadDays: 7 });
    // now = 2026-06-15; a 7-day lead opens on 2026-06-18, which is inside it.
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: new Date("2026-06-20"), userId: owner, objectId: "todo-obj" } });

    const items = await getUpcomingAndDue(now);

    expect(items).toEqual([expect.objectContaining({ kind: "todo", title: "Renew passport is due soon" })]);
  });

  it("does not surface a to-do outside its configured lead window", async () => {
    await seedSettings(owner, { todoReminderLeadDays: 7 });
    // now = 2026-06-15; a 7-day lead opens on 2026-07-01, still ahead of now.
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Renew passport", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Renew passport", dueDate: new Date("2026-07-08"), userId: owner, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("hides a to-do's advance reminder once reminders are disabled, but keeps an overdue one", async () => {
    await seedSettings(owner, { remindersEnabled: false, todoReminderLeadDays: 7 });
    await prisma.object.create({ data: { id: "todo-due-soon-obj", type: "TODO", name: "Due soon", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-due-soon", name: "Due soon", dueDate: new Date("2026-06-20"), userId: owner, objectId: "todo-due-soon-obj" } });
    await prisma.object.create({ data: { id: "todo-overdue-obj", type: "TODO", name: "Overdue", userId: owner } });
    await prisma.todo.create({ data: { id: "todo-overdue", name: "Overdue", dueDate: new Date("2026-06-10"), userId: owner, objectId: "todo-overdue-obj" } });

    const items = await getUpcomingAndDue(now);

    // Unlike milestones and custom items, a to-do's due/overdue phase is a
    // statement of fact and survives Reminders being off -- only its advance
    // phase is a prediction, and that is what the switch governs. The title
    // itself is unchanged from before this ticket ("is due"), preserving
    // existing wording exactly for every to-do that was already due or
    // overdue; only the new advance phase gets a distinct "is due soon".
    expect(items).toEqual([expect.objectContaining({ kind: "todo", title: "Overdue is due" })]);
  });

  it("rolls a yearly-repeating date forward to next year once this year's has passed", async () => {
    await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
    await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
    // This year's occurrence (June 1) has already passed relative to `now`
    // (June 15), and next year's (2027-06-01) is outside the 30-day window.
    await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: new Date("2020-06-01"), repeatsYearly: true } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  it("never surfaces another account's items", async () => {
    await seedSettings(stranger);
    await prisma.object.create({ data: { id: "todo-obj", type: "TODO", name: "Not yours", userId: stranger } });
    await prisma.todo.create({ data: { id: "todo-1", name: "Not yours", dueDate: new Date("2026-06-10"), userId: stranger, objectId: "todo-obj" } });

    await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
  });

  describe("dismissing a document or custom item", () => {
    /**
     * Unlike Needs Attention -- which only ever shows a record once it is
     * overdue, so dismissing one there was always a dismissal of something
     * overdue -- Upcoming & Due also shows the advance "expiring soon" /
     * "due soon" phase. The dismissal key names which of a record's two
     * notices was dismissed, not just its deadline (lib/attention/dismissal.ts),
     * precisely so dismissing this advance one is its own, independent act.
     */
    it("hides a document that is only expiring soon, not yet expired", async () => {
      const expiry = new Date("2026-06-25");
      await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: expiry, prompt: 30, userId: owner, objectId: "doc-obj" } });

      await expect(getUpcomingAndDue(now)).resolves.toEqual([expect.objectContaining({ kind: "document", title: "Passport is expiring" })]);

      await dismissAttentionItem(dismissalKey("document", "doc-1", "REMINDER_DUE", expiry));

      await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
    });

    it("hides a custom item that is only due soon, not yet overdue", async () => {
      const dueDate = new Date("2026-06-22");
      await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
      await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
      await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate, moduleId: "module-1", objectId: "item-obj" } });

      await expect(getUpcomingAndDue(now)).resolves.toEqual([expect.objectContaining({ kind: "custom", title: "Dune is due soon" })]);

      await dismissAttentionItem(dismissalKey("custom", "item-1", "REMINDER_DUE", dueDate));

      await expect(getUpcomingAndDue(now)).resolves.toEqual([]);
    });

    it("revives a dismissed document once its expiry date is edited to a new date", async () => {
      const expiry = new Date("2026-06-25");
      await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: expiry, prompt: 30, userId: owner, objectId: "doc-obj" } });
      await dismissAttentionItem(dismissalKey("document", "doc-1", "REMINDER_DUE", expiry));
      await expect(getUpcomingAndDue(now)).resolves.toEqual([]);

      await prisma.document.update({ where: { id: "doc-1" }, data: { expiryDate: new Date("2026-06-26") } });

      await expect(getUpcomingAndDue(now)).resolves.toEqual([expect.objectContaining({ kind: "document" })]);
    });

    /**
     * The exact bug this file's dismissal keys exist to prevent: dismissing a
     * document while it is only "expiring soon" must not silence it once it
     * has genuinely expired, and dismissing a custom item's "due soon" notice
     * must not silence it once it is actually overdue -- they read as two
     * different, more urgent things once the deadline actually arrives, and
     * each is dismissed on its own.
     */
    it("does not hide a document once it has actually expired, having only ever been dismissed while expiring soon", async () => {
      const expiry = new Date("2026-06-25");
      await prisma.object.create({ data: { id: "doc-obj", type: "DOCUMENT", name: "Passport", userId: owner } });
      await prisma.document.create({ data: { id: "doc-1", name: "Passport", type: "Identity", status: "Active", owner: "Owner", expiryDate: expiry, prompt: 30, userId: owner, objectId: "doc-obj" } });
      // Dismissed on 2026-06-15, while still only "expiring soon".
      await dismissAttentionItem(dismissalKey("document", "doc-1", "REMINDER_DUE", expiry));
      await expect(getUpcomingAndDue(now)).resolves.toEqual([]);

      // Now well past the expiry date -- the document has genuinely expired.
      const afterExpiry = new Date("2026-07-01T00:00:00.000Z");
      await expect(getUpcomingAndDue(afterExpiry)).resolves.toEqual([expect.objectContaining({ kind: "document", title: "Passport is expired" })]);
    });

    it("does not hide a custom item once it is actually overdue, having only ever been dismissed while due soon", async () => {
      const dueDate = new Date("2026-06-22");
      await prisma.customModule.create({ data: { id: "module-1", name: "Books", normalizedName: "books", icon: "star", color: "#111111", userId: owner } });
      await prisma.object.create({ data: { id: "item-obj", type: "CUSTOM_ITEM", name: "Dune", userId: owner } });
      await prisma.customItem.create({ data: { id: "item-1", name: "Dune", dueDate, moduleId: "module-1", objectId: "item-obj" } });
      // Dismissed on 2026-06-15, while still only "due soon".
      await dismissAttentionItem(dismissalKey("custom", "item-1", "REMINDER_DUE", dueDate));
      await expect(getUpcomingAndDue(now)).resolves.toEqual([]);

      // Now well past the due date -- the item is genuinely overdue.
      const afterDueDate = new Date("2026-07-01T00:00:00.000Z");
      await expect(getUpcomingAndDue(afterDueDate)).resolves.toEqual([expect.objectContaining({ kind: "custom", title: "Dune is over its due date" })]);
    });
  });

  describe("an Important Date's Create To-Do and Dismiss actions (KD-047)", () => {
    it("carries the person's linkable object id and a suggested to-do title", async () => {
      await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
      await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
      await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: new Date("2026-06-30"), repeatsYearly: true } });

      const items = await getUpcomingAndDue(now);

      expect(items).toEqual([expect.objectContaining({
        kind: "relationship",
        personObjectId: "person-obj",
        suggestedTodoTitle: "Do something for Sam's birthday",
      })]);
    });

    /**
     * Unlike a document or custom item's static field, a relationship date's
     * dismissal deadline is derived (`dismissAttentionItem` -> `currentDeadline`
     * resolves it via the real, ambient `getToday()`, not an injected clock --
     * there is no per-call "now" a dismiss button can pass it, the same as
     * production). These two tests anchor to the real day the suite runs on,
     * rather than the file's fixed historical `now`, so the dismissed
     * occurrence they name always matches what the action independently
     * recomputes.
     */
    it("hides a relationship date once its advance notice is dismissed, same as a document or custom item", async () => {
      await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
      await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
      const today = startOfUtcDay(new Date())!;
      const occurrence = addUtcDays(today, 15);
      await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: occurrence, repeatsYearly: false } });

      await expect(getUpcomingAndDue(today)).resolves.toEqual([expect.objectContaining({ kind: "relationship" })]);

      await dismissAttentionItem(dismissalKey("relationship", "date-1", "REMINDER_DUE", occurrence));

      await expect(getUpcomingAndDue(today)).resolves.toEqual([]);
    });

    it("revives a dismissed relationship date once it is rescheduled to a new date", async () => {
      await prisma.object.create({ data: { id: "person-obj", type: "PERSON", name: "Sam", userId: owner } });
      await prisma.person.create({ data: { id: "person-1", name: "Sam", userId: owner, objectId: "person-obj" } });
      const today = startOfUtcDay(new Date())!;
      const occurrence = addUtcDays(today, 15);
      await prisma.relationshipImportantDate.create({ data: { id: "date-1", selfPersonId: "person-1", label: "Birthday", date: occurrence, repeatsYearly: false } });
      await dismissAttentionItem(dismissalKey("relationship", "date-1", "REMINDER_DUE", occurrence));
      await expect(getUpcomingAndDue(today)).resolves.toEqual([]);

      // Editing the date makes a new deadline -- the old dismissal key stops
      // matching, the same mechanism a rescheduled document or custom item
      // relies on (see the "revives a dismissed document..." test above).
      await prisma.relationshipImportantDate.update({ where: { id: "date-1" }, data: { date: addUtcDays(today, 20) } });

      await expect(getUpcomingAndDue(today)).resolves.toEqual([expect.objectContaining({ kind: "relationship" })]);
    });
  });
});
