"use server";

import { prisma } from "@/lib/data/prisma";
import { DEFAULT_GOAL_UNITS, GOAL_STATUSES } from "@/lib/goals/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numeric = (data: FormData, key: string) => {
  const raw = value(data, key);
  return raw === "" ? null : Number(raw);
};
const refresh = (id: string) => { revalidatePath("/goals"); revalidatePath(`/goals/${id}`); };

export async function createGoalAction(data: FormData) {
  const name = value(data, "name");
  if (!name) return;
  const date = value(data, "targetDate");
  const goal = await prisma.goal.create({ data: { id: crypto.randomUUID(), name, targetDate: date ? new Date(`${date}T23:59:59.999Z`) : null, note: value(data, "note") || null } });
  redirect(`/goals/${goal.id}`);
}

export async function updateGoalStatusAction(id: string, data: FormData) {
  const status = value(data, "status");
  if (!GOAL_STATUSES.includes(status as typeof GOAL_STATUSES[number])) return;
  await prisma.goal.update({ where: { id }, data: { status } }); refresh(id);
}

export async function deleteGoalAction(id: string) {
  await prisma.goal.delete({ where: { id } }); redirect("/goals");
}

export async function addTargetAction(id: string, data: FormData) {
  const targetValue = numeric(data, "targetValue"); const currentValue = numeric(data, "currentValue"); const unit = value(data, "unit");
  if (targetValue === null || !Number.isFinite(targetValue) || currentValue === null || !Number.isFinite(currentValue) || !unit) return;
  if (!DEFAULT_GOAL_UNITS.some((item) => item.toLowerCase() === unit.toLowerCase())) await prisma.goalUnit.upsert({ where: { name: unit }, update: {}, create: { id: crypto.randomUUID(), name: unit } });
  await prisma.$transaction(async (tx) => {
    const previous = await tx.goal.findUnique({ where: { id }, select: { currentValue: true } });
    await tx.goal.update({ where: { id }, data: { targetValue, currentValue, unit } });
    if (previous?.currentValue !== currentValue) await tx.goalMetricSnapshot.create({ data: { id: crypto.randomUUID(), goalId: id, value: currentValue } });
    await tx.milestone.updateMany({ where: { goalId: id, value: { lte: currentValue }, completed: false }, data: { completed: true, autoCompleted: true } });
  }); refresh(id);
}

export async function removeTargetAction(id: string) {
  await prisma.$transaction([prisma.goal.update({ where: { id }, data: { targetValue: null, currentValue: null, unit: null } }), prisma.goalMetricSnapshot.deleteMany({ where: { goalId: id } })]);
  refresh(id);
}

export async function addMilestoneAction(id: string, data: FormData) {
  const name = value(data, "name"); const milestoneValue = numeric(data, "value"); const dueDate = value(data, "dueDate"); if (!name) return;
  const goal = await prisma.goal.findUnique({ where: { id }, select: { currentValue: true, _count: { select: { milestones: true } } } }); if (!goal) return;
  const auto = milestoneValue !== null && goal.currentValue !== null && goal.currentValue >= milestoneValue;
  await prisma.milestone.create({ data: { id: crypto.randomUUID(), goalId: id, name, value: milestoneValue, dueDate: dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null, completed: auto, autoCompleted: auto, position: goal._count.milestones } }); refresh(id);
}

export async function updateMilestoneDueDateAction(id: string, milestoneId: string, data: FormData) {
  const dueDate = value(data, "dueDate");
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id }, data: { dueDate: dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null } });
  refresh(id);
}

export async function removeMilestoneDueDateAction(id: string, milestoneId: string) {
  await prisma.milestone.updateMany({ where: { id: milestoneId, goalId: id }, data: { dueDate: null } });
  refresh(id);
}

export async function toggleMilestoneAction(id: string, milestoneId: string, completed: boolean) {
  await prisma.milestone.update({ where: { id: milestoneId }, data: { completed, autoCompleted: false } }); refresh(id);
}

export async function deleteMilestoneAction(id: string, milestoneId: string) { await prisma.milestone.delete({ where: { id: milestoneId } }); refresh(id); }

export async function toggleProgressAction(id: string, field: "showMilestoneProgress" | "showTargetProgress", shown: boolean) {
  await prisma.goal.update({ where: { id }, data: { [field]: shown } }); refresh(id);
}
