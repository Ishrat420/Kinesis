import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { addTargetAction, createGoalAction, toggleMilestoneAction, updateGoalFieldsAction, updateGoalStatusAction, updateGoalTargetDateAction } from "@/app/(app)/goals/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";

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

  it("toggleMilestoneAction records GOAL_MILESTONE_COMPLETED naming the milestone, only when completing", async () => {
    const objectId = await makeGoal("goal-milestone");
    const milestone = await prisma.milestone.create({ data: { id: "milestone-1", goalId: "goal-milestone", name: "Save deposit" } });

    await toggleMilestoneAction("goal-milestone", milestone.id, true);
    await expect(eventsOn(objectId)).resolves.toMatchObject([{ eventType: "GOAL_MILESTONE_COMPLETED", fieldLabel: "Save deposit" }]);

    await toggleMilestoneAction("goal-milestone", milestone.id, false);
    await expect(eventsOn(objectId)).resolves.toHaveLength(1); // reopening a milestone records nothing new
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
