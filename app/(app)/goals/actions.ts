"use server";

import { prisma } from "@/lib/data/prisma";
import { DEFAULT_GOAL_UNITS, GOAL_STATUSES } from "@/lib/goals/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addActivity } from "@/lib/data/activity";
import { requireKinesisUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
import { GOAL_RELATIONSHIP_TYPES, type GoalRelationshipType } from "@/lib/goals/relationships";
import { objectPairKey } from "@/lib/objects/relationships";
import { deleteObjects, objectFor } from "@/lib/data/objects";
import { completeCaptureConversion } from "@/lib/data/capture";

export type GoalActionState = { error?: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numeric = (data: FormData, key: string) => {
  const raw = value(data, key);
  return raw === "" ? null : Number(raw);
};
const optionalDate = (data: FormData, key: string) => {
  const raw = value(data, key);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
/** Names the date it clashes with, in the owner's own locale. */
const beforeTargetDate = async (dueDate: Date | null, targetDate: Date | null) => {
  if (!dueDate || !targetDate || dueDate < targetDate) return null;
  const { locale } = await getFormatPreferences();
  return `The due date must be before the goal target date of ${formatDate(targetDate, locale)}.`;
};
const refresh = (id: string) => { revalidatePath("/"); revalidatePath("/goals"); revalidatePath(`/goals/${id}`); };

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
  revalidatePath("/");
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

export async function deleteGoalAction(id: string) {
  const user = await requireKinesisUser();
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { objectId: true } });
  if (goal) await deleteObjects(prisma, [goal.objectId], user.id);
  revalidatePath("/");
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
  await prisma.$transaction(async (tx) => {
    const previous = await tx.goal.findFirst({ where: { id, userId: user.id }, select: { currentValue: true } });
    if (!previous) throw new Error("Goal not found");
    await tx.goal.update({ where: { id }, data: { targetValue, currentValue, unit } });
    if (previous?.currentValue !== currentValue) await tx.goalMetricSnapshot.create({ data: { id: crypto.randomUUID(), goalId: id, value: currentValue } });
    await tx.milestone.updateMany({ where: { goalId: id, value: { lte: currentValue }, completed: false }, data: { completed: true, completedAt: new Date(), autoCompleted: true } });
  }); refresh(id);
  return {};
}

export async function removeTargetAction(id: string) {
  const user = await requireKinesisUser();
  await prisma.$transaction([prisma.goal.updateMany({ where: { id, userId: user.id }, data: { targetValue: null, currentValue: null, unit: null } }), prisma.goalMetricSnapshot.deleteMany({ where: { goalId: id, goal: { userId: user.id } } })]);
  refresh(id);
}

export async function addMilestoneAction(id: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const name = value(data, "name"); const milestoneValue = numeric(data, "value"); const dueDate = optionalDate(data, "dueDate");
  if (!name) return { error: "Enter a milestone name." };
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  if (milestoneValue !== null && !Number.isFinite(milestoneValue)) return { error: "Enter the target value as a number." };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { currentValue: true, targetDate: true, _count: { select: { milestones: true } } } });
  if (!goal) return {};
  const conflict = await beforeTargetDate(dueDate, goal.targetDate);
  if (conflict) return { error: conflict };
  const auto = milestoneValue !== null && goal.currentValue !== null && goal.currentValue >= milestoneValue;
  await prisma.milestone.create({ data: { id: crypto.randomUUID(), goalId: id, name, value: milestoneValue, dueDate, completed: auto, completedAt: auto ? new Date() : null, autoCompleted: auto, position: goal._count.milestones } }); refresh(id);
  return {};
}

export async function updateMilestoneAction(id: string, milestoneId: string, _previousState: GoalActionState, data: FormData): Promise<GoalActionState> {
  const user = await requireKinesisUser();
  const name = value(data, "name"); const milestoneValue = numeric(data, "value"); const dueDate = optionalDate(data, "dueDate");
  if (!name) return { error: "Enter a milestone name." };
  if (dueDate === undefined) return { error: "Enter a valid due date." };
  if (milestoneValue !== null && !Number.isFinite(milestoneValue)) return { error: "Enter the target value as a number." };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, select: { targetDate: true } });
  if (!goal) return {};
  const conflict = await beforeTargetDate(dueDate, goal.targetDate);
  if (conflict) return { error: conflict };
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } }, data: { name, value: milestoneValue, dueDate } });
  refresh(id);
  return {};
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

export async function toggleMilestoneAction(id: string, milestoneId: string, completed: boolean) {
  const user = await requireKinesisUser();
  const owned = await prisma.milestone.findFirst({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } } });
  if (!owned) throw new Error("Milestone not found");
  const milestone = await prisma.milestone.update({ where: { id: milestoneId }, data: { completed, completedAt: completed ? new Date() : null, autoCompleted: false }, include: { goal: { select: { name: true } } } });
  if (completed) await addActivity({ action: "Completed", moduleName: "Milestone", objectName: `${milestone.name} for ${milestone.goal.name}`, icon: "goals", href: `/goals/${id}` });
  refresh(id);
}

export async function deleteMilestoneAction(id: string, milestoneId: string) { const user = await requireKinesisUser(); await prisma.milestone.deleteMany({ where: { id: milestoneId, goalId: id, goal: { userId: user.id } } }); refresh(id); }

export async function toggleProgressAction(id: string, field: "showMilestoneProgress" | "showTargetProgress", shown: boolean) {
  const user = await requireKinesisUser();
  await prisma.goal.updateMany({ where: { id, userId: user.id }, data: { [field]: shown } }); refresh(id);
}
