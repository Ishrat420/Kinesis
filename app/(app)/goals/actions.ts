"use server";

import { prisma } from "@/lib/data/prisma";
import { DEFAULT_GOAL_UNITS, GOAL_STATUSES } from "@/lib/goals/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addActivity } from "@/lib/data/activity";
import { requireKinesisUser } from "@/lib/auth";
import { formatDate, parseDateOnly } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
import { GOAL_RELATIONSHIP_TYPES, type GoalRelationshipType } from "@/lib/goals/relationships";
import { MEASURE_REMOVAL_CONFIRMATION } from "@/lib/goals/measure";
import { refuse, refusalOf } from "@/lib/actions/refusal";
import { revalidateShell } from "@/lib/actions/revalidate";
import { objectPairKey } from "@/lib/objects/relationships";
import { deleteObjects, objectFor } from "@/lib/data/objects";
import { completeCaptureConversion } from "@/lib/data/capture";
import { parseCustomFields, prepareCustomFields } from "@/lib/custom-fields/parse";
import { validateKinesisTargets } from "@/lib/data/kinesis-links";

export type GoalActionState = { error?: string; saved?: boolean };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numeric = (data: FormData, key: string) => {
  const raw = value(data, key);
  return raw === "" ? null : Number(raw);
};
const optionalDate = (data: FormData, key: string) => {
  const raw = value(data, key);
  if (!raw) return null;
  // parseDateOnly round-trips year/month/day rather than trusting the Date
  // constructor's own parsing, which silently rolls an impossible date like
  // 30 February into 1 March instead of rejecting it -- the same shared
  // check every other date-accepting action already goes through.
  const date = parseDateOnly(raw);
  if (!date) return undefined;
  date.setUTCHours(23, 59, 59, 999);
  return date;
};
/** Names the date it clashes with, in the owner's own locale. */
const beforeTargetDate = async (dueDate: Date | null, targetDate: Date | null) => {
  if (!dueDate || !targetDate || dueDate < targetDate) return null;
  const { locale } = await getFormatPreferences();
  return `The due date must be before the goal target date of ${formatDate(targetDate, locale)}.`;
};
const refresh = (id: string) => { revalidateShell(); revalidatePath("/goals"); revalidatePath(`/goals/${id}`); revalidatePath("/calendar"); revalidatePath("/goals/milestones/due-soon"); };

/** A goal's identity in the shared Object layer, resolved once and scoped to its owner. */
const goalObjectId = async (userId: string, goalId: string) =>
  (await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { objectId: true } }))?.objectId;

/**
 * Both ends of a link show it, so both goal pages are revalidated. Endpoints are
 * matched on object id; these goal ids only say which routes that means.
 */
const endpointGoals = {
  sourceObject: { select: { goal: { select: { id: true } } } },
  targetObject: { select: { goal: { select: { id: true } } } },
} as const;

type RelationshipEndpoints = { sourceObject: { goal: { id: string } | null }; targetObject: { goal: { id: string } | null } };
const refreshEndpoints = ({ sourceObject, targetObject }: RelationshipEndpoints) => {
  if (sourceObject.goal) refresh(sourceObject.goal.id);
  if (targetObject.goal) refresh(targetObject.goal.id);
};

export async function createGoalAction(_previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const name = value(data, "name");
  if (!name) return { error: "Enter a goal name." };
  const targetDate = optionalDate(data, "targetDate");
  if (targetDate === undefined) return { error: "Enter a valid target date." };
  const goal = await prisma.goal.create({ data: { id: crypto.randomUUID(), user: { connect: { id: user.id } }, name, targetDate, note: value(data, "note") || null, object: objectFor.goal(name, user.id) } });
  await addActivity({ action: "Added", moduleName: "Goals", objectName: goal.name, icon: "goals", href: `/goals/${goal.id}` });
  // No-op unless quick capture sent the user here to turn a To-Do into this goal.
  await completeCaptureConversion(data, { moduleName: "Goals", objectName: goal.name, icon: "goals", href: `/goals/${goal.id}` });
  revalidateShell();
  revalidatePath("/goals");
  redirect(`/goals/${goal.id}`);
}

export async function updateGoalStatusAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const status = value(data, "status");
  if (!GOAL_STATUSES.includes(status as typeof GOAL_STATUSES[number])) return { error: `Choose one of ${GOAL_STATUSES.join(", ")}.` };
  await prisma.goal.updateMany({ where: { id, userId: user.id }, data: { status } }); refresh(id);
  return {};
}

/**
 * Moves a goal's target date, which is the horizon everything else is measured
 * against: goal health's pace, the calendar's target pin, whether a milestone's
 * due date is still legal, and -- through `activeGoalWhere` -- whether the goal
 * and its milestones are still reminding at all. Nothing caches any of that, so
 * changing the date here is enough to move all of it.
 *
 * A date can only be pulled back as far as the milestones allow. Every due date
 * has to stay before the target, so shortening past one would leave the goal in
 * a state its own forms refuse to create.
 */
export async function updateGoalTargetDateAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const targetDate = optionalDate(data, "targetDate");
  if (targetDate === undefined) return { error: "Enter a valid target date." };

  const goal = await prisma.goal.findFirst({
    where: { id, userId: user.id },
    select: { milestones: { where: { dueDate: { not: null } }, orderBy: { dueDate: "desc" }, take: 1, select: { name: true, dueDate: true } } },
  });
  if (!goal) return {};

  const latest = goal.milestones[0];
  if (targetDate && latest?.dueDate && latest.dueDate >= targetDate) {
    const { locale } = await getFormatPreferences();
    return { error: `Milestone “${latest.name}” is due ${formatDate(latest.dueDate, locale)}. The target date must be after it.` };
  }

  await prisma.goal.update({ where: { id }, data: { targetDate } });
  refresh(id);
  return { saved: true };
}

export async function deleteGoalAction(id: string) {
  const user = await requireKinesisUser();
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (goal) await deleteObjects(prisma, [goal.objectId], user.id);
  revalidateShell();
  revalidatePath("/goals");
  redirect("/goals");
}

export async function addGoalRelationshipAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const targetId = value(data, "targetGoalId");
  const type = value(data, "type") as GoalRelationshipType;
  if (!targetId) return { error: "Choose a goal to link." };
  if (targetId === id) return { error: "A goal cannot be linked to itself." };
  if (!GOAL_RELATIONSHIP_TYPES.includes(type)) return { error: "Choose a valid relationship type." };
  const owned = await prisma.goal.findMany({ where: { userId: user.id, id: { in: [id, targetId] } }, select: { id: true, objectId: true } });
  if (owned.length !== 2) return { error: "One or more goals were not found." };
  const objectByGoal = new Map(owned.map((goal) => [goal.id, goal.objectId]));
  const sourceObjectId = objectByGoal.get(id)!;
  const targetObjectId = objectByGoal.get(targetId)!;
  try {
    await prisma.objectRelationship.create({ data: { userId: user.id, sourceObjectId, targetObjectId, pairKey: objectPairKey(sourceObjectId, targetObjectId), type } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { error: "These goals are already linked." };
    throw error;
  }
  refresh(id); refresh(targetId);
  return {};
}

export async function updateGoalRelationshipAction(id: string, relationshipId: string, data: FormData) {
  const user = await requireKinesisUser();
  const type = value(data, "type") as GoalRelationshipType;
  if (!GOAL_RELATIONSHIP_TYPES.includes(type)) return;
  const objectId = await goalObjectId(user.id, id);
  if (!objectId) return;
  const relationship = await prisma.objectRelationship.findFirst({ where: { id: relationshipId, userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] }, select: endpointGoals });
  if (!relationship) return;
  await prisma.objectRelationship.update({ where: { id: relationshipId }, data: { type } });
  refreshEndpoints(relationship);
}

export async function removeGoalRelationshipAction(id: string, relationshipId: string) {
  const user = await requireKinesisUser();
  const objectId = await goalObjectId(user.id, id);
  if (!objectId) return;
  const relationship = await prisma.objectRelationship.findFirst({ where: { id: relationshipId, userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] }, select: endpointGoals });
  if (!relationship) return;
  await prisma.objectRelationship.delete({ where: { id: relationshipId } });
  refreshEndpoints(relationship);
}

export async function addTargetAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const targetValue = numeric(data, "targetValue"); const currentValue = numeric(data, "currentValue"); const unit = value(data, "unit");
  if (targetValue === null || !Number.isFinite(targetValue)) return { error: "Enter a target value as a number." };
  if (currentValue === null || !Number.isFinite(currentValue)) return { error: "Enter a current value as a number." };
  if (targetValue < 0 || currentValue < 0) return { error: "Target and current values cannot be negative." };
  if (!unit) return { error: "Enter a unit, such as $AUD or Books." };
  if (!DEFAULT_GOAL_UNITS.some((item) => item.toLowerCase() === unit.toLowerCase())) await prisma.goalUnit.upsert({ where: { userId_name: { userId: user.id, name: unit } }, update: {}, create: { id: crypto.randomUUID(), userId: user.id, name: unit } });
  try {
    await prisma.$transaction(async (tx) => {
    const previous = await tx.goal.findFirst({ where: { id, userId: user.id }, select: { currentValue: true } });
    if (!previous) refuse("This goal no longer exists.");
    await tx.goal.update({ where: { id }, data: { targetValue, currentValue, unit } });
    if (previous?.currentValue !== currentValue) await tx.goalMetricSnapshot.create({ data: { id: crypto.randomUUID(), goalId: id, value: currentValue } });
    await tx.milestone.updateMany({ where: { goalId: id, value: { lte: currentValue }, completed: false }, data: { completed: true, completedAt: new Date(), autoCompleted: true } });
    });
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  refresh(id);
  return { saved: true };
}

/**
 * Removing a goal's measure takes everything measured in it with it, in one
 * transaction: the goal's own values, the history goal health averages, and the
 * value every milestone holds in that unit. Leaving the milestone values behind
 * was the bug -- a number with no unit, no goal value to complete it against and
 * an input the milestone form still offered, which is neither editable nor
 * removable once the measure it belonged to is gone.
 *
 * `autoCompleted` goes with them for the same reason. It records that a
 * completion was calculated from the measure rather than chosen, and it is what
 * the milestone row offers to undo; once the comparison behind it cannot be
 * made, the claim is unsupportable. The completion itself is left alone. It is
 * milestone data, and it stays the owner's to reopen.
 *
 * The confirmation is enforced here rather than only in the dialog. A stale form
 * -- or a milestone that took a value between the page rendering and the button
 * being pressed -- would otherwise cascade without anyone having been asked.
 */
export async function removeTargetAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { milestones: { where: { value: { not: null } }, select: { id: true }, take: 1 } } });
  if (!goal) return {};
  if (goal.milestones.length && value(data, "confirmed") !== "true") return { error: MEASURE_REMOVAL_CONFIRMATION };
  await prisma.$transaction([
    prisma.goal.updateMany({ where: { id, userId: user.id }, data: { targetValue: null, currentValue: null, unit: null } }),
    prisma.goalMetricSnapshot.deleteMany({ where: { goalId: id, goal: { userId: user.id } } }),
    prisma.milestone.updateMany({ where: { goalId: id, goal: { userId: user.id } }, data: { value: null, autoCompleted: false } }),
  ]);
  refresh(id);
  return { saved: true };
}

/**
 * A milestone value only means anything against a goal that has a measure, so a
 * goal without one stores none -- whatever a form submitted. That keeps a stale
 * form, or a submission racing a removal, from re-establishing the orphaned
 * value the measure's removal exists to clear, and makes an ordinary edit to a
 * milestone's name or date save the milestone clean.
 */
const measuredValue = (goalTargetValue: number | null, milestoneValue: number | null) =>
  goalTargetValue === null ? null : milestoneValue;

export async function addMilestoneAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const name = value(data, "name"); const milestoneValue = numeric(data, "value"); const dueDate = optionalDate(data, "dueDate");
  if (!name) return { error: "Enter a milestone name." };
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  if (milestoneValue !== null && !Number.isFinite(milestoneValue)) return { error: "Enter the target value as a number." };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { targetValue: true, currentValue: true, targetDate: true, _count: { select: { milestones: true } } } });
  if (!goal) return {};
  const conflict = await beforeTargetDate(dueDate, goal.targetDate);
  if (conflict) return { error: conflict };
  const measured = measuredValue(goal.targetValue, milestoneValue);
  const auto = measured !== null && goal.currentValue !== null && goal.currentValue >= measured;
  await prisma.milestone.create({ data: { id: crypto.randomUUID(), goalId: id, name, value: measured, dueDate, completed: auto, completedAt: auto ? new Date() : null, autoCompleted: auto, position: goal._count.milestones } }); refresh(id);
  return { saved: true };
}

export async function updateMilestoneAction(id: string, milestoneId: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const name = value(data, "name"); const milestoneValue = numeric(data, "value"); const dueDate = optionalDate(data, "dueDate");
  if (!name) return { error: "Enter a milestone name." };
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  if (milestoneValue !== null && !Number.isFinite(milestoneValue)) return { error: "Enter the target value as a number." };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { targetValue: true, targetDate: true } });
  if (!goal) return {};
  const conflict = await beforeTargetDate(dueDate, goal.targetDate);
  if (conflict) return { error: conflict };
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } }, data: { name, value: measuredValue(goal.targetValue, milestoneValue), dueDate } });
  refresh(id);
  return { saved: true };
}

export async function duplicateMilestoneAction(id: string, milestoneId: string) {
  const user = await requireKinesisUser();
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } } });
  if (!milestone) return;
  const count = await prisma.milestone.count({ where: { goalId: id } });
  await prisma.milestone.create({ data: { id: crypto.randomUUID(), goalId: id, name: milestone.name, value: milestone.value, dueDate: milestone.dueDate, position: count } });
  refresh(id);
}

export async function updateMilestoneDueDateAction(id: string, milestoneId: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const dueDate = optionalDate(data, "dueDate");
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { targetDate: true } });
  if (!goal) return {};
  const conflict = await beforeTargetDate(dueDate, goal.targetDate);
  if (conflict) return { error: conflict };
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } }, data: { dueDate } });
  refresh(id);
  return {};
}

export async function removeMilestoneDueDateAction(id: string, milestoneId: string) {
  const user = await requireKinesisUser();
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } }, data: { dueDate: null } });
  refresh(id);
}

/**
 * Completing or reopening a milestone reports its outcome, because a toggle that
 * silently does nothing is indistinguishable from one that worked: the checkbox
 * springs back and the person is left guessing. It takes the form-state shape so
 * the row can drive it with `useActionState` and show the reason in place.
 */
export async function toggleMilestoneAction(id: string, milestoneId: string, completed: boolean): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const owned = await prisma.milestone.findFirst({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } } });
  if (!owned) return { error: "This milestone no longer exists." };
  const milestone = await prisma.milestone.update({ where: { id: milestoneId }, data: { completed, completedAt: completed ? new Date() : null, autoCompleted: false }, include: { goal: { select: { name: true } } } });
  if (completed) await addActivity({ action: "Completed", moduleName: "Milestone", objectName: `${milestone.name} for ${milestone.goal.name}`, icon: "goals", href: `/goals/${id}` });
  refresh(id);
  return {};
}

export async function deleteMilestoneAction(id: string, milestoneId: string) { const user = await requireKinesisUser(); await prisma.milestone.deleteMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } } }); refresh(id); }

export async function toggleProgressAction(id: string, field: "showMilestoneProgress" | "showTargetProgress", shown: boolean) {
  const user = await requireKinesisUser();
  await prisma.goal.updateMany({ where: { id, userId: user.id }, data: { [field]: shown } }); refresh(id);
}

/**
 * A goal's supporting context (KD-033): notes, links to external resources,
 * and Kinesis Links to other records -- Milestones and Linked Goals stay
 * meaningful checkpoints and independent outcomes precisely by not being
 * where this goes instead.
 *
 * These are the same field types Documents and Custom Items already offer
 * (TEXT, LINK, KINESIS_LINK), through the same editor and the same shared
 * `ObjectField` store every field-capable record now uses -- a goal is not a
 * fourth implementation of this, just a third record type pointed at it.
 */
export async function updateGoalFieldsAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const form = parseCustomFields(data);
  if (!form.ok) return { error: form.error };
  const unowned = await validateKinesisTargets(form.fields);
  if (unowned) return { error: unowned };
  const fields = prepareCustomFields(form.fields);
  try {
    await prisma.$transaction(async (tx) => {
      const owned = await tx.goal.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
      if (!owned) refuse("This goal no longer exists.");
      const existingFields = await tx.objectField.findMany({ where: { objectId: owned.objectId }, select: { id: true, type: true } });
      const existingTypes = new Map(existingFields.map((field) => [field.id, field.type]));
      if (fields.some((field) => existingTypes.has(field.id) && existingTypes.get(field.id) !== field.type)) refuse("A custom field's type cannot be changed once it has been saved.");
      await tx.objectField.deleteMany({ where: { objectId: owned.objectId } });
      // A field's targets are a nested create -- createMany cannot carry
      // those, so each field (with its own links) is created on its own.
      for (const field of fields) await tx.objectField.create({ data: { ...field, objectId: owned.objectId } });
    });
  } catch (failure) {
    const refused = refusalOf(failure);
    if (refused === null) throw failure;
    return { error: refused };
  }
  refresh(id);
  return { saved: true };
}
