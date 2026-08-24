import { prisma } from "./prisma";
import { DEFAULT_GOAL_UNITS, effectiveStatus } from "@/lib/goals/format";
import { calculateGoalHealth } from "@/lib/goals/health";
import { connection } from "next/server";

export async function syncAndGetGoals() {
  await connection();
  const goals = await prisma.goal.findMany({ include: { milestones: true, metricHistory: { orderBy: { recordedAt: "asc" } } }, orderBy: { updatedAt: "desc" } });
  const overdue = goals.filter((goal) => effectiveStatus(goal.status, goal.targetDate) === "Archived" && goal.status === "Active");
  if (overdue.length) {
    await prisma.goal.updateMany({ where: { id: { in: overdue.map(({ id }) => id) } }, data: { status: "Archived" } });
    overdue.forEach((goal) => { goal.status = "Archived"; });
  }
  return goals;
}

export async function getGoal(id: string) {
  const include = { milestones: { orderBy: { position: "asc" as const } }, metricHistory: { orderBy: { recordedAt: "asc" as const } } };
  const goal = await prisma.goal.findUnique({ where: { id }, include });
  if (!goal) return null;
  const status = effectiveStatus(goal.status, goal.targetDate);
  if (status !== goal.status) return prisma.goal.update({ where: { id }, data: { status }, include });
  return goal;
}

export async function getGoalUnits() {
  const custom = await prisma.goalUnit.findMany({ orderBy: { name: "asc" } });
  return [...new Set([...DEFAULT_GOAL_UNITS, ...custom.map(({ name }) => name)])];
}

export async function getGoalsForLinking() {
  await connection();
  await prisma.goal.updateMany({
    where: { status: "Active", targetDate: { lt: new Date() } },
    data: { status: "Archived" },
  });
  return prisma.goal.findMany({
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getGoalDashboardSummary(now = new Date()) {
  await connection();
  await prisma.goal.updateMany({
    where: { status: "Active", targetDate: { lt: now } },
    data: { status: "Archived" },
  });

  const goals = await prisma.goal.findMany({
    where: { status: "Active" },
    include: { metricHistory: { orderBy: { recordedAt: "asc" } }, milestones: { select: { completed: true, dueDate: true } } },
  });

  const atRisk = goals.filter((goal) => {
    if (goal.milestones.some((milestone) => !milestone.completed && milestone.dueDate && milestone.dueDate < now)) return true;
    if (goal.targetValue === null || goal.currentValue === null || !goal.targetDate) return false;
    if (goal.currentValue === goal.targetValue) return false;

    const health = calculateGoalHealth({
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      targetDate: goal.targetDate,
      unit: goal.unit,
      history: goal.metricHistory,
      now,
    });
    return health?.status === "AT RISK";
  }).length;

  return { active: goals.length, atRisk };
}

export async function getMilestonesDueSoon(now = new Date()) {
  await connection();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const oneMonthFromToday = new Date(today);
  oneMonthFromToday.setUTCMonth(oneMonthFromToday.getUTCMonth() + 1);

  return prisma.milestone.findMany({
    where: {
      completed: false,
      dueDate: { gte: today, lte: oneMonthFromToday },
      goal: { status: "Active" },
    },
    include: { goal: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { position: "asc" }],
  });
}

export async function getActiveIncompleteMilestones() {
  await connection();
  return prisma.milestone.findMany({
    where: {
      completed: false,
      goal: { status: "Active" },
    },
    include: { goal: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
  });
}
