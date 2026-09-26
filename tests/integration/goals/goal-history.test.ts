import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { addMilestoneAction, addTargetAction, createGoalAction, deleteMilestoneAction, removeMilestoneDueDateAction, removeTargetAction, toggleMilestoneAction, updateGoalFieldsAction, updateGoalStatusAction, updateGoalTargetDateAction, updateMilestoneAction, updateMilestoneDueDateAction } from "@/app/(app)/goals/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";
import { displayNumber } from "@/lib/goals/format";
import { DEFAULT_LOCALE } from "@/lib/format/preferences";

/** KD-048 Phase 1 remainder: Goals' own lifecycle and field changes enter the ObjectEvent history. */

const owner = "goal-history-owner";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

async function makeGoal(id: string, extra: Record<string, unknown> = {}) {
  const objectId = `${id}-object`;
  await prisma.object.create({ data: { id: objectId, type: "GOAL", name: id, userId: owner } });
  await prisma.goal.create({ data: { id, name: id, userId: owner, objectId, ...extra } });
  return objectId;
}

const eventsOn = (objectId: string) => prisma.objectEvent.findMany({ where: { objectId }, orderBy: { occurredAt: "asc" } });

describe.sequential("a Goal's own history (KD-048)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Goal", lastName: "Owner", email: "goal-history@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("createGoalAction records ITEM_CREATED", async () => {
    await createGoalAction({}, form({ name: "goal-created" }));
    const goal = await prisma.goal.findFirstOrThrow({ where: { userId: owner, name: "goal-created" } });

    await expect(eventsOn(goal.objectId)).resolves.toMatchObject([{ eventType: "ITEM_CREATED" }]);
  });

  it("updateGoalStatusAction records GOAL_COMPLETED when moving to Finished", async () => {
    const objectId = await makeGoal("goal-finish", { status: "Active" });

    await updateGoalStatusAction("goal-finish", {}, form({ status: "Finished" }));

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "GOAL_COMPLETED" }]);
  });

  it("updateGoalStatusAction records GOAL_REOPENED when moving back to Active from any prior status (KD-052)", async () => {
    const objectId = await makeGoal("goal-reopen", { status: "Archived" });

    await updateGoalStatusAction("goal-reopen", {}, form({ status: "Active" }));

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "GOAL_REOPENED" }]);
  });

  it("updateGoalStatusAction records a generic STATUS_CHANGED for any other transition", async () => {
    const objectId = await makeGoal("goal-revisit", { status: "Active" });

    await updateGoalStatusAction("goal-revisit", {}, form({ status: "Revisit Later" }));

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "STATUS_CHANGED", oldValue: "Active", newValue: "Revisit Later" }]);
  });

  it("updateGoalStatusAction records nothing when the status is resubmitted unchanged", async () => {
    const objectId = await makeGoal("goal-same", { status: "Active" });

    await updateGoalStatusAction("goal-same", {}, form({ status: "Active" }));

    await expect(eventsOn(objectId)).resolves.toEqual([]);
  });

  it("updateGoalTargetDateAction records a FIELD_CHANGED for the target date", async () => {
    const objectId = await makeGoal("goal-target-date");

    await updateGoalTargetDateAction("goal-target-date", {}, form({ targetDate: "2030-06-01" }));

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "FIELD_CHANGED", fieldKey: "targetDate", oldValue: null, newValue: "2030-06-01" }]);
  });

  it("addTargetAction records FIELD_CHANGED for targetValue, currentValue, and unit together", async () => {
    const objectId = await makeGoal("goal-measure");

    await addTargetAction("goal-measure", {}, form({ targetValue: "50000", currentValue: "1000", unit: "$AUD" }));

    const events = await eventsOn(objectId);
    const keys = events.filter((event) => event.eventType === "FIELD_CHANGED").map((event) => event.fieldKey).sort();
    expect(keys).toEqual(["currentValue", "targetValue", "unit"]);
  });

  it("addTargetAction records only what changed on a second save", async () => {
    const objectId = await makeGoal("goal-measure-again");
    await addTargetAction("goal-measure-again", {}, form({ targetValue: "50000", currentValue: "1000", unit: "$AUD" }));

    await addTargetAction("goal-measure-again", {}, form({ targetValue: "50000", currentValue: "2000", unit: "$AUD" }));

    const events = await eventsOn(objectId);
    const secondSave = events.filter((event) => event.eventType === "FIELD_CHANGED" && event.fieldKey === "currentValue");
    expect(secondSave).toHaveLength(2); // one from each save
    expect(events.filter((event) => event.eventType === "FIELD_CHANGED" && event.fieldKey === "targetValue")).toHaveLength(1); // only the first save touched it
  });

  it("addTargetAction bakes the goal's own unit into targetValue/currentValue's History strings", async () => {
    const objectId = await makeGoal("goal-measure-units");

    await addTargetAction("goal-measure-units", {}, form({ targetValue: "50000", currentValue: "1000", unit: "$AUD" }));

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { fieldKey: "targetValue", oldValue: null, newValue: displayNumber(50000, "$AUD", DEFAULT_LOCALE) },
      { fieldKey: "currentValue", oldValue: null, newValue: displayNumber(1000, "$AUD", DEFAULT_LOCALE) },
      { fieldKey: "unit", oldValue: null, newValue: "$AUD" },
    ]);
  });

  it("removeTargetAction records FIELD_CHANGED clearing targetValue, currentValue, and unit, with the unit baked into each cleared value", async () => {
    const objectId = await makeGoal("goal-remove-measure");
    await addTargetAction("goal-remove-measure", {}, form({ targetValue: "50000", currentValue: "1000", unit: "$AUD" }));

    await removeTargetAction("goal-remove-measure", {}, new FormData());

    const events = await eventsOn(objectId);
    const cleared = events.filter((event) => event.eventType === "FIELD_CHANGED" && event.newValue === null);
    expect(cleared).toMatchObject([
      { fieldKey: "targetValue", oldValue: displayNumber(50000, "$AUD", DEFAULT_LOCALE), newValue: null },
      { fieldKey: "currentValue", oldValue: displayNumber(1000, "$AUD", DEFAULT_LOCALE), newValue: null },
      { fieldKey: "unit", oldValue: "$AUD", newValue: null },
    ]);
  });

  it("removeTargetAction records nothing when there was no measure to clear", async () => {
    const objectId = await makeGoal("goal-no-measure");

    await removeTargetAction("goal-no-measure", {}, new FormData());

    await expect(eventsOn(objectId)).resolves.toEqual([]);
  });

  it("toggleMilestoneAction records GOAL_MILESTONE_COMPLETED/GOAL_MILESTONE_REOPENED naming the milestone and its progress, on each toggle", async () => {
    const objectId = await makeGoal("goal-milestone");
    await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-milestone", name: "Save deposit", position: 0 } });
    await prisma.milestone.create({ data: { id: "milestone-2", goalId: "goal-milestone", name: "Sign lease", position: 1 } });

    await toggleMilestoneAction("goal-milestone", "milestone-1", true);
    await toggleMilestoneAction("goal-milestone", "milestone-1", false);

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Save deposit", newValue: "1/2" },
      { eventType: "GOAL_MILESTONE_REOPENED", fieldLabel: "Save deposit", newValue: "0/2" },
    ]);
  });

  it("addMilestoneAction records GOAL_MILESTONE_ADDED naming the milestone, with its due date when one was set", async () => {
    const objectId = await makeGoal("goal-milestone-add");

    await addMilestoneAction("goal-milestone-add", {}, form({ name: "Save deposit", dueDate: "2030-06-01" }));
    await addMilestoneAction("goal-milestone-add", {}, form({ name: "No due date" }));

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "GOAL_MILESTONE_ADDED", fieldLabel: "Save deposit", newValue: "2030-06-01" },
      { eventType: "GOAL_MILESTONE_ADDED", fieldLabel: "No due date", newValue: null },
    ]);
  });

  it("updateMilestoneAction records one GOAL_MILESTONE_UPDATED row per changed attribute, tagged with the milestone's own (new) name", async () => {
    const objectId = await makeGoal("goal-milestone-update", { targetValue: 5000, currentValue: 0, unit: "$AUD" });
    await prisma.milestone.create({ data: { id: "milestone-update", goalId: "goal-milestone-update", name: "Save deposit", value: 1000, dueDate: new Date("2030-06-01T00:00:00.000Z"), position: 0 } });

    await updateMilestoneAction("goal-milestone-update", "milestone-update", {}, form({ name: "Deposit saved", value: "2000", dueDate: "2030-07-01" }));

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "name", fieldLabel: "Deposit saved", oldValue: "Save deposit", newValue: "Deposit saved" },
      { eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "value", fieldLabel: "Deposit saved", oldValue: displayNumber(1000, "$AUD", DEFAULT_LOCALE), newValue: displayNumber(2000, "$AUD", DEFAULT_LOCALE) },
      { eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "dueDate", fieldLabel: "Deposit saved", oldValue: "2030-06-01", newValue: "2030-07-01" },
    ]);
  });

  it("updateMilestoneAction records nothing when the save changes nothing", async () => {
    const objectId = await makeGoal("goal-milestone-update-noop");
    await prisma.milestone.create({ data: { id: "milestone-noop", goalId: "goal-milestone-update-noop", name: "Save deposit", position: 0 } });

    await updateMilestoneAction("goal-milestone-update-noop", "milestone-noop", {}, form({ name: "Save deposit" }));

    await expect(eventsOn(objectId)).resolves.toEqual([]);
  });

  it("updateMilestoneDueDateAction and removeMilestoneDueDateAction each record a GOAL_MILESTONE_UPDATED for just the due date", async () => {
    const objectId = await makeGoal("goal-milestone-quick-date");
    await prisma.milestone.create({ data: { id: "milestone-quick-date", goalId: "goal-milestone-quick-date", name: "Save deposit", dueDate: new Date("2030-06-01T00:00:00.000Z"), position: 0 } });

    await updateMilestoneDueDateAction("goal-milestone-quick-date", "milestone-quick-date", {}, form({ dueDate: "2030-07-01" }));
    await removeMilestoneDueDateAction("goal-milestone-quick-date", "milestone-quick-date");

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "dueDate", fieldLabel: "Save deposit", oldValue: "2030-06-01", newValue: "2030-07-01" },
      { eventType: "GOAL_MILESTONE_UPDATED", fieldKey: "dueDate", fieldLabel: "Save deposit", oldValue: "2030-07-01", newValue: null },
    ]);
  });

  it("deleteMilestoneAction records GOAL_MILESTONE_DELETED naming the milestone and the remaining progress", async () => {
    const objectId = await makeGoal("goal-milestone-delete");
    await prisma.milestone.create({ data: { id: "milestone-keep", goalId: "goal-milestone-delete", name: "Sign lease", completed: true, position: 0 } });
    await prisma.milestone.create({ data: { id: "milestone-delete", goalId: "goal-milestone-delete", name: "Save deposit", position: 1 } });

    await deleteMilestoneAction("goal-milestone-delete", "milestone-delete");

    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "GOAL_MILESTONE_DELETED", fieldLabel: "Save deposit", newValue: "1/1" }]);
    await expect(prisma.milestone.count({ where: { goalId: "goal-milestone-delete" } })).resolves.toBe(1);
  });

  it("updateGoalFieldsAction diffs the goal's own ad-hoc custom fields", async () => {
    const objectId = await makeGoal("goal-fields");
    const data = new FormData();
    data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ label: "Notes", type: "TEXT", value: "First note" }]));
    await updateGoalFieldsAction("goal-fields", {}, data);
    const [created] = await prisma.objectField.findMany({ where: { objectId } });

    const secondSave = new FormData();
    secondSave.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify([{ id: created.id, label: "Notes", type: "TEXT", value: "Updated note" }]));
    await updateGoalFieldsAction("goal-fields", {}, secondSave);

    const events = await eventsOn(objectId);
    expect(events).toMatchObject([
      { eventType: "FIELD_CHANGED", fieldKey: created.id, oldValue: null, newValue: "First note" },
      { eventType: "FIELD_CHANGED", fieldKey: created.id, oldValue: "First note", newValue: "Updated note" },
    ]);
  });
});
