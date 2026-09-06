import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn(), getFormatPreferences: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/format/server", () => ({ getFormatPreferences: mocks.getFormatPreferences }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { addMilestoneAction, addTargetAction, removeTargetAction, updateMilestoneAction } from "@/app/(app)/goals/actions";
import { MEASURE_REMOVAL_CONFIRMATION, milestonesUsingMeasure } from "@/lib/goals/measure";
import { DEFAULT_FORMAT_PREFERENCES } from "@/lib/format/preferences";

/**
 * BUG-003. A goal's measure is the only thing that gives a milestone value a
 * unit, so removing the measure has to take those values with it -- and say so
 * first. These run against the real database because the whole point of the fix
 * is what the rows look like afterwards: not one orphaned value, not one status
 * calculated from a measure that no longer exists.
 */

const owner = "goal-measure-owner";
const GOAL = "goal-measured";
const UNMEASURED = "goal-unmeasured";
const PAST = new Date("2020-01-01T00:00:00.000Z");
const FUTURE = new Date("2099-01-01T00:00:00.000Z");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const remove = (id: string, confirmed = false) => removeTargetAction(id, {}, confirmed ? form({ confirmed: "true" }) : new FormData());
const readGoal = (id = GOAL) => prisma.goal.findUniqueOrThrow({ where: { id }, include: { milestones: { orderBy: { position: "asc" } }, metricHistory: true } });
const milestone = (id: string) => prisma.milestone.findUniqueOrThrow({ where: { id } });

async function makeGoal(id: string, measured: boolean) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId: owner } });
  await prisma.goal.create({
    data: {
      id, name: id, userId: owner, objectId: object.id,
      ...(measured ? { targetValue: 100, currentValue: 25, unit: "Books" } : {}),
    },
  });
}

describe.sequential("removing a goal's measurable target", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    mocks.getFormatPreferences.mockResolvedValue(DEFAULT_FORMAT_PREFERENCES);
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Measure", lastName: "Owner", email: "goal-measure@example.test" } });

    await makeGoal(GOAL, true);
    await makeGoal(UNMEASURED, false);
    // One milestone of every status the ticket names, plus one that never had a
    // value: the cascade has to reach all of the first three and leave the last.
    await prisma.milestone.createMany({
      data: [
        { id: "m-active", goalId: GOAL, name: "Read the first ten", value: 10, dueDate: FUTURE, position: 0 },
        { id: "m-overdue", goalId: GOAL, name: "Read twenty", value: 20, dueDate: PAST, position: 1 },
        { id: "m-done", goalId: GOAL, name: "Read five", value: 5, completed: true, completedAt: PAST, position: 2 },
        { id: "m-plain", goalId: GOAL, name: "Join the library", position: 3 },
        { id: "m-unmeasured", goalId: UNMEASURED, name: "Pick a book", position: 0 },
      ],
    });
    await prisma.goalMetricSnapshot.createMany({
      data: [
        { id: "snapshot-one", goalId: GOAL, value: 10, recordedAt: PAST },
        { id: "snapshot-two", goalId: GOAL, value: 25 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("counts every milestone using the measure, whatever its status", async () => {
    const { milestones } = await readGoal();

    // What the page asks about and what the action refuses to do unasked are the
    // same set: a completed or overdue milestone loses its value like any other.
    expect(milestonesUsingMeasure(milestones).map(({ id }) => id)).toEqual(["m-active", "m-overdue", "m-done"]);
  });

  it("asks before removing a measure a milestone is using", async () => {
    await expect(remove(GOAL)).resolves.toEqual({ error: MEASURE_REMOVAL_CONFIRMATION });
  });

  it("leaves the goal and every milestone untouched when the removal is not confirmed", async () => {
    const before = await readGoal();

    await remove(GOAL);

    await expect(readGoal()).resolves.toEqual(before);
  });

  it("removes the measure from the goal and from every milestone once confirmed", async () => {
    await expect(remove(GOAL, true)).resolves.toEqual({});

    const goal = await readGoal();
    expect(goal).toMatchObject({ targetValue: null, currentValue: null, unit: null });
    expect(goal.milestones.map(({ value }) => value)).toEqual([null, null, null, null]);
  });

  it("preserves everything about a milestone except the value it held in the measure", async () => {
    await remove(GOAL, true);

    const goal = await readGoal();
    expect(goal.milestones.map(({ id, name, dueDate, completed, completedAt }) => ({ id, name, dueDate, completed, completedAt }))).toEqual([
      { id: "m-active", name: "Read the first ten", dueDate: FUTURE, completed: false, completedAt: null },
      { id: "m-overdue", name: "Read twenty", dueDate: PAST, completed: false, completedAt: null },
      { id: "m-done", name: "Read five", dueDate: null, completed: true, completedAt: PAST },
      { id: "m-plain", name: "Join the library", dueDate: null, completed: false, completedAt: null },
    ]);
  });

  it("leaves goal health nothing to calculate from", async () => {
    await remove(GOAL, true);

    // Health reads the target against the current value over the recorded
    // history. All three go, so no ON TRACK or AT RISK can survive the removal.
    const goal = await readGoal();
    expect(goal.targetValue).toBeNull();
    expect(goal.currentValue).toBeNull();
    expect(goal.metricHistory).toEqual([]);
  });

  it("keeps an automatic completion but stops crediting it to the measure", async () => {
    await addTargetAction(GOAL, {}, form({ targetValue: "100", currentValue: "20", unit: "Books" }));
    await expect(milestone("m-active")).resolves.toMatchObject({ completed: true, autoCompleted: true });

    await remove(GOAL, true);

    // The completion is the owner's to keep; the claim that a comparison made it
    // is not, once the values on both sides of that comparison are gone.
    await expect(milestone("m-active")).resolves.toMatchObject({ completed: true, autoCompleted: false });
  });

  it("removes a measure no milestone uses without asking first", async () => {
    await expect(remove(UNMEASURED)).resolves.toEqual({});

    await expect(readGoal(UNMEASURED)).resolves.toMatchObject({ targetValue: null, currentValue: null, unit: null });
  });

  it("saves an ordinary milestone edit afterwards without restoring a value", async () => {
    await remove(GOAL, true);

    // A form rendered before the removal still carries the old value. Renaming
    // through it has to save the name and drop the value, not resurrect it.
    await expect(updateMilestoneAction(GOAL, "m-active", {}, form({ name: "Read the first twelve", value: "10" }))).resolves.toEqual({});

    await expect(milestone("m-active")).resolves.toMatchObject({ name: "Read the first twelve", value: null });
  });

  it("stores no value on a milestone added to a goal with no measure", async () => {
    await addMilestoneAction(UNMEASURED, {}, form({ name: "Read on the train", value: "7" }));

    const added = await prisma.milestone.findFirstOrThrow({ where: { goalId: UNMEASURED, name: "Read on the train" } });
    expect(added).toMatchObject({ value: null, completed: false, autoCompleted: false });
  });
});
