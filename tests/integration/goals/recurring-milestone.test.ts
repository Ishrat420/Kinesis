import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { addMilestoneAction, duplicateMilestoneAction, removeMilestoneDueDateAction, toggleMilestoneAction, updateMilestoneAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { getCalendarItems } from "@/lib/data/calendar";
import { collectNotifications } from "@/lib/data/notification-collection";
import { getToday } from "@/lib/format/server";
import { addUtcDays, formatDateInput } from "@/lib/dates";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { getUpcomingAndDue } from "@/lib/data/upcoming";

/**
 * KD-056 for goal milestones, end to end against a real database: the repeat
 * button's inputs through the real actions, ticking occurrences until the
 * goal's target date ends the repeat (only then does progress count it), the
 * target-value rule, the calendar's projection, notifications, and the
 * migration's check constraints.
 */

const owner = "recurring-milestone-owner";
const GOAL = "recurring-milestone-goal";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const repeating = (name: string, dueDate: string, recurrenceRule: string, extra: Record<string, string> = {}) =>
  form({ name, dueDate, repeat: "on", recurrenceRule, ...extra });

async function makeGoal({ targetDate = null, targetValue = null }: { targetDate?: Date | null; targetValue?: number | null } = {}) {
  const object = await prisma.object.create({ data: { id: `object-${GOAL}`, type: "GOAL", name: "Run a half marathon", userId: owner } });
  await prisma.goal.create({ data: { id: GOAL, name: "Run a half marathon", userId: owner, objectId: object.id, targetDate, targetValue, currentValue: targetValue === null ? null : 0, unit: targetValue === null ? null : "km" } });
  return object.id;
}
const onlyMilestone = () => prisma.milestone.findFirstOrThrow({ where: { goalId: GOAL } });
const goalEvents = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a repeating goal milestone", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Recurring", lastName: "Milestone", email: "recurring-milestone@example.test" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  describe("adding and editing", () => {
    it("stores the rule with its anchor day", async () => {
      await makeGoal({ targetDate: d("2099-12-31") });
      await expect(addMilestoneAction(GOAL, {}, repeating("Monthly review", "2099-01-31", "MONTHLY"))).resolves.toEqual({ saved: true });
      await expect(onlyMilestone()).resolves.toMatchObject({ dueDate: d("2099-01-31"), recurrence: "MONTHLY", recurrenceAnchorDay: 31, completedOccurrences: 0 });
    });

    it("refuses a repeat on a milestone with a target value", async () => {
      await makeGoal({ targetDate: d("2099-12-31"), targetValue: 100 });
      await expect(addMilestoneAction(GOAL, {}, repeating("Run 20 km", "2099-01-31", "WEEKLY", { value: "20" }))).resolves.toEqual({ error: "A milestone with a target value can't repeat." });
      await expect(prisma.milestone.count({ where: { goalId: GOAL } })).resolves.toBe(0);
    });

    it("refuses repeat on without a rule", async () => {
      await makeGoal();
      await expect(addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-31", ""))).resolves.toEqual({ error: "Pick how often it repeats." });
    });

    it("keeps the anchor on an unchanged re-save, logs a Repeats change, and re-anchors on reschedule", async () => {
      const objectId = await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Monthly review", "2099-01-31", "MONTHLY"));
      const milestone = await onlyMilestone();
      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-31"); // now 28 Feb, anchored on the 31st

      await updateMilestoneAction(GOAL, milestone.id, {}, repeating("Monthly review", "2099-02-28", "MONTHLY"));
      await expect(onlyMilestone()).resolves.toMatchObject({ recurrenceAnchorDay: 31 });

      await updateMilestoneAction(GOAL, milestone.id, {}, repeating("Monthly review", "2099-02-28", "WEEKLY"));
      const repeatsChange = (await goalEvents(objectId)).find((event) => event.fieldKey === "recurrence");
      expect(repeatsChange).toMatchObject({ eventType: "GOAL_MILESTONE_UPDATED", fieldLabel: "Monthly review", oldValue: "Every month", newValue: "Every week" });

      await updateMilestoneAction(GOAL, milestone.id, {}, repeating("Monthly review", "2099-02-28", "MONTHLY"));
      await updateMilestoneDueDateAction(GOAL, milestone.id, {}, form({ dueDate: "2099-03-15" }));
      await expect(onlyMilestone()).resolves.toMatchObject({ dueDate: d("2099-03-15"), recurrence: "MONTHLY", recurrenceAnchorDay: 15 });
    });

    it("removing the date removes the repeat; duplicating copies the rule but starts the count afresh", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-05", "WEEKLY"));
      const milestone = await onlyMilestone();
      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-05");

      await duplicateMilestoneAction(GOAL, milestone.id);
      const copy = await prisma.milestone.findFirstOrThrow({ where: { goalId: GOAL, id: { not: milestone.id } } });
      expect(copy).toMatchObject({ recurrence: "WEEKLY", completedOccurrences: 0 });

      await removeMilestoneDueDateAction(GOAL, milestone.id);
      await expect(prisma.milestone.findUniqueOrThrow({ where: { id: milestone.id } })).resolves.toMatchObject({ dueDate: null, recurrence: null });
    });
  });

  describe("ticking it", () => {
    it("moves the date on and counts the occurrence, until the last one before the target date completes it", async () => {
      const objectId = await makeGoal({ targetDate: d("2099-01-25") });
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();

      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03")).resolves.toEqual({ nextDueDate: "2099-01-10" });
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-10")).resolves.toEqual({ nextDueDate: "2099-01-17" });
      await expect(onlyMilestone()).resolves.toMatchObject({ completed: false, dueDate: d("2099-01-17"), completedOccurrences: 2 });

      // 17 Jan + 1 week = 24 Jan, still before the 25 Jan target.
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-17")).resolves.toEqual({ nextDueDate: "2099-01-24" });
      // 24 Jan + 1 week = 31 Jan, past the target: this was the last one.
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-24")).resolves.toEqual({ finished: true });
      await expect(onlyMilestone()).resolves.toMatchObject({ completed: true, dueDate: d("2099-01-24"), completedOccurrences: 4 });

      const events = (await goalEvents(objectId)).filter((event) => event.eventType !== "GOAL_MILESTONE_ADDED");
      expect(events.map(({ eventType, fieldLabel, oldValue, newValue }) => ({ eventType, fieldLabel, oldValue, newValue }))).toEqual([
        { eventType: "RECURRENCE_COMPLETED", fieldLabel: "Weekly long run", oldValue: "2099-01-03", newValue: "2099-01-10" },
        { eventType: "RECURRENCE_COMPLETED", fieldLabel: "Weekly long run", oldValue: "2099-01-10", newValue: "2099-01-17" },
        { eventType: "RECURRENCE_COMPLETED", fieldLabel: "Weekly long run", oldValue: "2099-01-17", newValue: "2099-01-24" },
        // Progress counts it only now: 1 of 1 milestones completed.
        { eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Weekly long run", oldValue: null, newValue: "1/1" },
      ]);
    });

    it("repeats indefinitely for a goal with no target date", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Yearly check-up", "2099-01-03", "YEARLY"));
      const milestone = await onlyMilestone();
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03")).resolves.toEqual({ nextDueDate: "2100-01-03" });
      await expect(onlyMilestone()).resolves.toMatchObject({ completed: false });
    });

    it("refuses a stale tick instead of skipping an occurrence", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();
      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03");

      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03")).resolves.toMatchObject({ conflict: true });
      await expect(onlyMilestone()).resolves.toMatchObject({ dueDate: d("2099-01-10"), completedOccurrences: 1 });
    });

    it("catches a long-overdue milestone up to today or later", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2000-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();
      const today = await getToday();

      const result = await toggleMilestoneAction(GOAL, milestone.id, true, "2000-01-03");
      const next = d(result.nextDueDate!);
      expect(next.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(next.getTime() - today.getTime()).toBeLessThan(7 * 86_400_000);
    });
  });

  describe("the calendar", () => {
    it("projects occurrences with the repeat icon, stopping before the goal's target date", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC", milestoneReminderLeadDays: 3 } });
      await makeGoal({ targetDate: d("2099-01-25") });
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();

      const items = await getCalendarItems(d("2098-12-29"), new Date("2099-02-08T23:59:59.999Z"));
      const mine = items.filter((entry) => entry.id.startsWith(`milestone-${milestone.id}`) || entry.id.startsWith(`milestone-reminder-${milestone.id}`));
      expect(mine.map(({ id, date, recurring }) => ({ id, date, recurring }))).toEqual([
        { id: `milestone-reminder-${milestone.id}`, date: "2098-12-31", recurring: undefined },
        { id: `milestone-${milestone.id}`, date: "2099-01-03", recurring: true },
        { id: `milestone-${milestone.id}-2099-01-10`, date: "2099-01-10", recurring: true },
        { id: `milestone-${milestone.id}-2099-01-17`, date: "2099-01-17", recurring: true },
        { id: `milestone-${milestone.id}-2099-01-24`, date: "2099-01-24", recurring: true },
      ]);
    });
  });

  describe("notifications", () => {
    it("open on the owner's milestone lead time, and notify afresh for the next occurrence once ticked", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC", milestoneReminderLeadDays: 10 } });
      await makeGoal();
      const today = await getToday();
      const overdue = addUtcDays(today, -1);
      await addMilestoneAction(GOAL, {}, repeating("Water the garden", formatDateInput(overdue), "EVERY_N_DAYS", { recurrenceDays: "3" }));
      const milestone = await onlyMilestone();
      const milestoneNotes = async () => (await collectNotifications(owner)).filter((note) => note.source === "milestone");

      const before = await milestoneNotes();
      expect(before.map((note) => note.sourceId)).toEqual([milestone.id]);

      await toggleMilestoneAction(GOAL, milestone.id, true, formatDateInput(overdue));

      const after = await milestoneNotes();
      expect(after.map((note) => ({ type: note.type, due: formatDateInput(note.expiryDate!) }))).toEqual([
        { type: "REMINDER_DUE", due: formatDateInput(addUtcDays(overdue, 3)) },
      ]);
      expect(after[0].key).not.toBe(before[0].key);
    });
  });

  describe("database backstop", () => {
    it("refuses a repeat with a target value, without a due date, or N on the wrong rule", async () => {
      await makeGoal();
      const base = { goalId: GOAL, name: "Bad", position: 0 };
      await expect(prisma.milestone.create({ data: { id: crypto.randomUUID(), ...base, dueDate: d("2099-01-03"), recurrence: "WEEKLY", value: 5 } })).rejects.toThrow();
      await expect(prisma.milestone.create({ data: { id: crypto.randomUUID(), ...base, recurrence: "WEEKLY" } })).rejects.toThrow();
      await expect(prisma.milestone.create({ data: { id: crypto.randomUUID(), ...base, dueDate: d("2099-01-03"), recurrence: "WEEKLY", recurrenceDays: 3 } })).rejects.toThrow();
    });
  });

  describe("History", () => {
    it("names the milestone and both dates on the goal's own History", async () => {
      const objectId = await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();
      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03");

      const [latest] = await getObjectEvents(objectId);
      expect(latest.title).toBe('Milestone "Weekly long run" occurrence completed');
      expect(latest.detail).toMatch(/^Due 3 Jan(uary)? 2099 · next due 10 Jan(uary)? 2099$/);
    });
  });

  describe("schedules", () => {
    it("keeps a month-end anchor across short months", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Monthly review", "2099-01-31", "MONTHLY"));
      const milestone = await onlyMilestone();
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-31")).resolves.toEqual({ nextDueDate: "2099-02-28" });
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-02-28")).resolves.toEqual({ nextDueDate: "2099-03-31" });
      await expect(onlyMilestone()).resolves.toMatchObject({ recurrenceAnchorDay: 31, completedOccurrences: 2 });
    });

    it("steps every N days from the current due date", async () => {
      await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Water the garden", "2099-01-01", "EVERY_N_DAYS", { recurrenceDays: "10" }));
      const milestone = await onlyMilestone();
      expect(milestone).toMatchObject({ recurrence: "EVERY_N_DAYS", recurrenceDays: 10, recurrenceAnchorDay: null });
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-01")).resolves.toEqual({ nextDueDate: "2099-01-11" });
    });

    it("refuses an N outside 1 to 999", async () => {
      await makeGoal();
      await expect(addMilestoneAction(GOAL, {}, repeating("Water the garden", "2099-01-01", "EVERY_N_DAYS", { recurrenceDays: "1000" }))).resolves.toEqual({ error: "N must be a whole number from 1 to 999." });
      await expect(prisma.milestone.count({ where: { goalId: GOAL } })).resolves.toBe(0);
    });
  });

  describe("stopping the repeat", () => {
    it("turns it into a one-off, so the next tick completes it for good", async () => {
      const objectId = await makeGoal();
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();
      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03");

      await updateMilestoneAction(GOAL, milestone.id, {}, form({ name: "Weekly long run", dueDate: "2099-01-10" }));
      await expect(onlyMilestone()).resolves.toMatchObject({ recurrence: null, recurrenceAnchorDay: null, dueDate: d("2099-01-10") });

      await toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-10");
      await expect(onlyMilestone()).resolves.toMatchObject({ completed: true, dueDate: d("2099-01-10") });
      const events = await goalEvents(objectId);
      expect(events.find((event) => event.fieldKey === "recurrence")).toMatchObject({ oldValue: "Every week", newValue: null });
      expect(events.at(-1)).toMatchObject({ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Weekly long run" });
    });
  });

  describe("Upcoming & Due", () => {
    it("shows the next occurrence once one is ticked", async () => {
      await prisma.userSettings.create({ data: { userId: owner, timeZone: "UTC", milestoneReminderLeadDays: 10 } });
      await makeGoal();
      const today = await getToday();
      const due = formatDateInput(addUtcDays(today, 2));
      await addMilestoneAction(GOAL, {}, repeating("Water the garden", due, "EVERY_N_DAYS", { recurrenceDays: "3" }));
      const milestone = await onlyMilestone();
      const mine = async () => (await getUpcomingAndDue()).filter((item) => item.kind === "milestone" && item.milestoneId === milestone.id).map((item) => item.date.slice(0, 10));

      await expect(mine()).resolves.toEqual([due]);
      await toggleMilestoneAction(GOAL, milestone.id, true, due);
      await expect(mine()).resolves.toEqual([formatDateInput(addUtcDays(today, 5))]);
    });
  });

  describe("the calendar's limits", () => {
    it("projects nothing for a repeating milestone once its last occurrence is done", async () => {
      await makeGoal({ targetDate: d("2099-01-12") });
      await addMilestoneAction(GOAL, {}, repeating("Weekly long run", "2099-01-03", "WEEKLY"));
      const milestone = await onlyMilestone();
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-03")).resolves.toEqual({ nextDueDate: "2099-01-10" });
      await expect(toggleMilestoneAction(GOAL, milestone.id, true, "2099-01-10")).resolves.toEqual({ finished: true });

      const items = await getCalendarItems(d("2099-01-01"), new Date("2099-02-28T23:59:59.999Z"));
      const projected = items.filter((entry) => entry.id.startsWith(`milestone-${milestone.id}`));
      expect(projected.map(({ date, recurring }) => ({ date, recurring }))).toEqual([{ date: "2099-01-10", recurring: undefined }]);
    });
  });

  describe("ownership", () => {
    it("can't tick someone else's milestone", async () => {
      const stranger = "recurring-milestone-stranger";
      await prisma.user.deleteMany({ where: { id: stranger } });
      await prisma.user.create({ data: { id: stranger, firstName: "Some", lastName: "One", email: "recurring-milestone-stranger@example.test" } });
      try {
        const object = await prisma.object.create({ data: { id: "stranger-goal-object", type: "GOAL", name: "Their goal", userId: stranger } });
        await prisma.goal.create({ data: { id: "stranger-goal", name: "Their goal", userId: stranger, objectId: object.id } });
        await prisma.milestone.create({ data: { id: "stranger-milestone", goalId: "stranger-goal", name: "Theirs", position: 0, dueDate: d("2099-01-03"), recurrence: "WEEKLY" } });

        const result = await toggleMilestoneAction("stranger-goal", "stranger-milestone", true, "2099-01-03");
        expect(result.error).toBeTruthy();
        await expect(prisma.milestone.findUniqueOrThrow({ where: { id: "stranger-milestone" } })).resolves.toMatchObject({ dueDate: d("2099-01-03"), completedOccurrences: 0, completed: false });
      } finally {
        await prisma.user.deleteMany({ where: { id: stranger } });
      }
    });
  });
});
