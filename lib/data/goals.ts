import { prisma } from "./prisma";
import { DEFAULT_GOAL_UNITS, effectiveStatus } from "@/lib/goals/format";

export async function syncAndGetGoals() {
  const goals = await prisma.goal.findMany({ include: { milestones: true }, orderBy: { updatedAt: "desc" } });
  const overdue = goals.filter((goal) => effectiveStatus(goal.status, goal.targetDate) === "Archived" && goal.status === "Active");
  if (overdue.length) {
    await prisma.goal.updateMany({ where: { id: { in: overdue.map(({ id }) => id) } }, data: { status: "Archived" } });
    overdue.forEach((goal) => { goal.status = "Archived"; });
  }
  return goals;
}

export async function getGoal(id: string) {
  const goal = await prisma.goal.findUnique({ where: { id }, include: { milestones: { orderBy: { position: "asc" } } } });
  if (!goal) return null;
  const status = effectiveStatus(goal.status, goal.targetDate);
  if (status !== goal.status) return prisma.goal.update({ where: { id }, data: { status }, include: { milestones: { orderBy: { position: "asc" } } } });
  return goal;
}

export async function getGoalUnits() {
  const custom = await prisma.goalUnit.findMany({ orderBy: { name: "asc" } });
  return [...new Set([...DEFAULT_GOAL_UNITS, ...custom.map(({ name }) => name)])];
}
