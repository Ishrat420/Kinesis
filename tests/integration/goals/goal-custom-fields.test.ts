import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { updateGoalFieldsAction } from "@/app/(app)/goals/actions";
import { CUSTOM_FIELDS_FORM_KEY } from "@/lib/custom-fields/types";

/**
 * Documents and custom items go through `parseCustomFields`/`prepareCustomFields`
 * for exactly this save path (see lib/custom-fields/parse.ts and the recent fix
 * to it), and both now have direct regression coverage for the orphaned-link and
 * type-immutability cases. `updateGoalFieldsAction` runs the identical shape --
 * its own transaction, its own type-immutability check against `ObjectField` --
 * but had none. These run against the real database because the behaviour under
 * test is exactly what the rows look like after the transaction: which fields
 * and links survive, and which save is refused before anything is written.
 */

const owner = "goal-fields-owner";
const GOAL = "goal-with-fields";
const TARGET_GOAL = "goal-link-target";

const payload = (fields: Array<Record<string, unknown>>) => {
  const data = new FormData();
  data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify(fields));
  return data;
};

async function makeGoal(id: string, userId: string) {
  const object = await prisma.object.create({ data: { id: `object-${id}`, type: "GOAL", name: id, userId } });
  await prisma.goal.create({ data: { id, name: id, userId, objectId: object.id } });
  return object.id;
}

const readFields = (objectId: string) =>
  prisma.objectField.findMany({ where: { objectId }, include: { links: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } });

describe.sequential("updateGoalFieldsAction", () => {
  let objectId: string;
  let targetObjectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.requireKinesisUser.mockResolvedValue({ id: owner });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Fields", lastName: "Owner", email: "goal-fields@example.test" } });
    objectId = await makeGoal(GOAL, owner);
    targetObjectId = await makeGoal(TARGET_GOAL, owner);
  });

  it("saves a new set of fields, including a Kinesis Link with a chosen target", async () => {
    const result = await updateGoalFieldsAction(GOAL, {}, payload([
      { label: "Why this goal", type: "TEXT", value: "Long-term health" },
      { label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [targetObjectId] },
    ]));
    expect(result).toEqual({ saved: true });

    const fields = await readFields(objectId);
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ label: "Why this goal", type: "TEXT", value: "Long-term health" });
    expect(fields[1]).toMatchObject({ label: "Related goal", type: "KINESIS_LINK" });
    expect(fields[1].links.map((link) => link.targetObjectId)).toEqual([targetObjectId]);
  });

  it("refuses to change an existing field's type, and leaves it untouched", async () => {
    await updateGoalFieldsAction(GOAL, {}, payload([{ label: "Note", type: "TEXT", value: "First" }]));
    const [existing] = await readFields(objectId);

    const result = await updateGoalFieldsAction(GOAL, {}, payload([
      { id: existing.id, label: "Note", type: "NUMBER", value: "5" },
    ]));
    expect(result).toEqual({ error: "A custom field's type cannot be changed once it has been saved." });

    const [unchanged] = await readFields(objectId);
    expect(unchanged).toMatchObject({ id: existing.id, type: "TEXT", value: "First" });
  });

  it("requires a target for a brand-new Kinesis Link field, and writes nothing", async () => {
    const result = await updateGoalFieldsAction(GOAL, {}, payload([
      { label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [] },
    ]));
    expect(result).toEqual({ error: "Choose what “Related goal” links to." });
    expect(await readFields(objectId)).toHaveLength(0);
  });

  it("does not block the save when an existing Kinesis Link field's own target was already cleared elsewhere", async () => {
    await updateGoalFieldsAction(GOAL, {}, payload([
      { label: "Note", type: "TEXT", value: "Keep me" },
      { label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [targetObjectId] },
    ]));
    const before = await readFields(objectId);
    const linkField = before.find((field) => field.type === "KINESIS_LINK")!;
    const noteField = before.find((field) => field.type === "TEXT")!;

    // The cascade this field would go through in the app: deleting the target
    // object removes just that FieldLink row (see FieldLink's own onDelete),
    // leaving the field itself in place with no targets.
    await prisma.object.delete({ where: { id: targetObjectId } });

    const result = await updateGoalFieldsAction(GOAL, {}, payload([
      { id: noteField.id, label: "Note", type: "TEXT", value: "Still here" },
      { id: linkField.id, label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [] },
    ]));
    expect(result).toEqual({ saved: true });

    const after = await readFields(objectId);
    expect(after.find((field) => field.id === noteField.id)).toMatchObject({ value: "Still here" });
    expect(after.find((field) => field.id === linkField.id)?.links).toEqual([]);
  });

  it("says so when the goal no longer exists, without writing anything", async () => {
    const result = await updateGoalFieldsAction("no-such-goal", {}, payload([{ label: "Note", type: "TEXT", value: "x" }]));
    expect(result).toEqual({ error: "This goal no longer exists." });
  });

  it("does not let a save through for a goal owned by someone else", async () => {
    const otherOwner = "goal-fields-other-owner";
    await prisma.user.deleteMany({ where: { id: otherOwner } });
    await prisma.user.create({ data: { id: otherOwner, firstName: "Other", lastName: "Owner", email: "goal-fields-other@example.test" } });
    const otherObjectId = await makeGoal("goal-fields-someone-elses-goal", otherOwner);

    const result = await updateGoalFieldsAction("goal-fields-someone-elses-goal", {}, payload([{ label: "Note", type: "TEXT", value: "x" }]));
    expect(result).toEqual({ error: "This goal no longer exists." });
    expect(await readFields(otherObjectId)).toHaveLength(0);
  });
});
