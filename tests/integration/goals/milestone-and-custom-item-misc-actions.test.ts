import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/data/activity", () => ({ addActivity: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { duplicateMilestoneAction } from "@/app/(app)/goals/actions";
import { promoteFieldToTemplateAction } from "@/app/(app)/custom-modules/actions";
import { captureLinkOptionsAction } from "@/app/(app)/todos/actions";

/**
 * Three small server actions that had no integration coverage at all:
 * duplicateMilestoneAction (the goal page's "Duplicate" menu item),
 * promoteFieldToTemplateAction (KD-035's "promote this extra field to the
 * template" flow), and captureLinkOptionsAction (what the quick-capture
 * details picker offers). Each has real branching -- ownership scoping,
 * transactional writes, or a filter that matters for correctness -- that a
 * mocked Prisma client wouldn't reliably exercise the same way a real one does.
 */

const owner = "misc-actions-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

describe.sequential("duplicateMilestoneAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Misc", lastName: "Owner", email: "misc-actions@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  async function makeGoalWithMilestone() {
    const object = await prisma.object.create({ data: { id: "dup-goal-object", type: "GOAL", userId: owner, name: "Read more" } });
    const goal = await prisma.goal.create({ data: { id: "dup-goal", objectId: object.id, userId: owner, name: "Read more", targetValue: 12, unit: "Books" } });
    const milestone = await prisma.milestone.create({ data: { id: "dup-milestone", goalId: goal.id, name: "First 3 books", value: 3, dueDate: new Date("2026-03-01T00:00:00.000Z"), position: 0 } });
    return { goal, milestone };
  }

  it("copies the milestone's name, value and due date as a new, incomplete row appended at the end", async () => {
    const { goal, milestone } = await makeGoalWithMilestone();
    await prisma.milestone.update({ where: { id: milestone.id }, data: { completed: true, completedAt: new Date() } });

    await duplicateMilestoneAction(goal.id, milestone.id);

    const milestones = await prisma.milestone.findMany({ where: { goalId: goal.id }, orderBy: { position: "asc" } });
    expect(milestones).toHaveLength(2);
    const copy = milestones[1];
    expect(copy.id).not.toBe(milestone.id);
    expect(copy).toMatchObject({ name: "First 3 books", value: 3, position: 1, completed: false, completedAt: null });
    expect(copy.dueDate?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("does nothing when the milestone belongs to someone else's goal", async () => {
    const stranger = "misc-actions-stranger";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "misc-stranger@example.test" } });
    const strangerObject = await prisma.object.create({ data: { id: "stranger-goal-object", type: "GOAL", userId: stranger, name: "Not yours" } });
    const strangerGoal = await prisma.goal.create({ data: { id: "stranger-goal", objectId: strangerObject.id, userId: stranger, name: "Not yours" } });
    const strangerMilestone = await prisma.milestone.create({ data: { id: "stranger-milestone", goalId: strangerGoal.id, name: "Not yours", position: 0 } });

    await duplicateMilestoneAction(strangerGoal.id, strangerMilestone.id);

    await expect(prisma.milestone.count({ where: { goalId: strangerGoal.id } })).resolves.toBe(1);
    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});

describe.sequential("promoteFieldToTemplateAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Misc", lastName: "Owner", email: "misc-actions@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  async function makeItemWithExtraField() {
    const template = await prisma.template.create({ data: { id: "promote-template", userId: owner, name: "Habit tracker", fields: { create: [{ id: "promote-existing-field", label: "Status", type: "TEXT", position: 0 }] } } });
    await prisma.customModule.create({ data: { id: "promote-module", userId: owner, name: "Habits", normalizedName: "habits", icon: "star", color: "#111111", templateId: template.id } });
    const object = await prisma.object.create({ data: { id: "promote-item-object", type: "CUSTOM_ITEM", userId: owner, name: "Meditate", templateId: template.id } });
    const item = await prisma.customItem.create({ data: { id: "promote-item", name: "Meditate", moduleId: "promote-module", objectId: object.id } });
    const extraField = await prisma.objectField.create({ data: { id: "promote-extra-field", objectId: object.id, label: "Streak", type: "NUMBER", value: "5", position: 1 } });
    return { template, item, extraField };
  }

  it("creates a real template field from the item's extra field and links it, appended after existing fields", async () => {
    const { template, item, extraField } = await makeItemWithExtraField();

    const result = await promoteFieldToTemplateAction("promote-module", item.id, extraField.id);
    expect(result).toEqual({ saved: true });

    const fields = await prisma.templateField.findMany({ where: { templateId: template.id }, orderBy: { position: "asc" } });
    expect(fields.map((f) => f.label)).toEqual(["Status", "Streak"]);
    const promoted = fields.find((f) => f.label === "Streak")!;
    expect(promoted.type).toBe("NUMBER");

    const updatedField = await prisma.objectField.findUniqueOrThrow({ where: { id: extraField.id } });
    expect(updatedField.templateFieldId).toBe(promoted.id);
    expect(updatedField.value).toBe("5");
  });

  it("refuses a field that's already a template field", async () => {
    const { template, item } = await makeItemWithExtraField();
    const templateField = await prisma.templateField.findFirstOrThrow({ where: { templateId: template.id, label: "Status" } });
    const itemObjectId = (await prisma.customItem.findUniqueOrThrow({ where: { id: item.id } })).objectId;
    const alreadyPromoted = await prisma.objectField.create({ data: { id: "promote-already-linked-field", objectId: itemObjectId, label: "Status", type: "TEXT", value: "In progress", position: 2, templateFieldId: templateField.id } });

    const result = await promoteFieldToTemplateAction("promote-module", item.id, alreadyPromoted.id);
    expect(result.error).toBeTruthy();
  });

  it("refuses an item that doesn't exist or isn't owned by the caller", async () => {
    const { extraField } = await makeItemWithExtraField();
    const result = await promoteFieldToTemplateAction("promote-module", "does-not-exist", extraField.id);
    expect(result).toEqual({ error: "This item no longer exists." });
  });
});

describe.sequential("captureLinkOptionsAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Misc", lastName: "Owner", email: "misc-actions@example.test" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.$disconnect();
  });

  it("offers the owner's own non-To-Do objects, but never another To-Do or another owner's objects", async () => {
    await prisma.object.create({ data: { id: "link-goal-object", type: "GOAL", userId: owner, name: "Read more" } });
    await prisma.goal.create({ data: { id: "link-goal", objectId: "link-goal-object", userId: owner, name: "Read more" } });
    const ownTodoObject = await prisma.object.create({ data: { id: "link-own-todo-object", type: "TODO", userId: owner, name: "Other to-do" } });
    await prisma.todo.create({ data: { id: "link-own-todo", objectId: ownTodoObject.id, userId: owner, name: "Other to-do", status: "TODO" } });

    const stranger = "misc-actions-link-stranger";
    await prisma.user.deleteMany({ where: { id: stranger } });
    await prisma.user.create({ data: { id: stranger, firstName: "S", lastName: "T", email: "misc-link-stranger@example.test" } });
    await prisma.object.create({ data: { id: "link-stranger-object", type: "GOAL", userId: stranger, name: "Not yours" } });

    const options = await captureLinkOptionsAction();
    expect(options.map((o) => o.objectId)).toEqual(["link-goal-object"]);
    expect(options.map((o) => o.objectId)).not.toContain("link-own-todo-object");
    expect(options.map((o) => o.objectId)).not.toContain("link-stranger-object");

    await prisma.user.deleteMany({ where: { id: stranger } });
  });
});
