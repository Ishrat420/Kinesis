import { prisma } from "./prisma";
import { DEFAULT_GOAL_UNITS, effectiveStatus } from "@/lib/goals/format";
import { calculateGoalHealth } from "@/lib/goals/health";
import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";

export async function syncAndGetGoals() {
  await connection();
  const user = await requireKinesisUser();
  const goals = await prisma.goal.findMany({ where: { userId: user.id }, include: { milestones: true, metricHistory: { orderBy: { recordedAt: "asc" } } }, orderBy: { updatedAt: "desc" } });
  const overdue = goals.filter((goal) => effectiveStatus(goal.status, goal.targetDate) === "Archived" && goal.status === "Active");
  if (overdue.length) {
    await prisma.goal.updateMany({ where: { userId: user.id, id: { in: overdue.map(({ id }) => id) } }, data: { status: "Archived" } });
    overdue.forEach((goal) => { goal.status = "Archived"; });
  }
  return goals;
}

export async function getGoal(id: string) {
  const user = await requireKinesisUser();
  const include = { milestones: { orderBy: { position: "asc" as const } }, metricHistory: { orderBy: { recordedAt: "asc" as const } } };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, include });
  if (!goal) return null;
  const status = effectiveStatus(goal.status, goal.targetDate);
  if (status !== goal.status) return prisma.goal.update({ where: { id }, data: { status }, include });
  return goal;
}

export async function getGoalUnits() {
  const user = await requireKinesisUser();
  const custom = await prisma.goalUnit.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  return [...new Set([...DEFAULT_GOAL_UNITS, ...custom.map(({ name }) => name)])];
}

export async function getGoalsForLinking() {
  await connection();
  const user = await requireKinesisUser();
  await prisma.goal.updateMany({
    where: { userId: user.id, status: "Active", targetDate: { lt: new Date() } },
    data: { status: "Archived" },
  });
  return prisma.goal.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getGoalDashboardSummary(now = new Date()) {
  await connection();
  const user = await requireKinesisUser();
  await prisma.goal.updateMany({
    where: { userId: user.id, status: "Active", targetDate: { lt: now } },
    data: { status: "Archived" },
  });

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, status: "Active" },
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
  const user = await requireKinesisUser();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const oneMonthFromToday = new Date(today);
  oneMonthFromToday.setUTCMonth(oneMonthFromToday.getUTCMonth() + 1);

  return prisma.milestone.findMany({
    where: {
      completed: false,
      dueDate: { gte: today, lte: oneMonthFromToday },
      goal: { userId: user.id, status: "Active" },
    },
    include: { goal: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { position: "asc" }],
  });
}

export async function getActiveIncompleteMilestones() {
  await connection();
  const user = await requireKinesisUser();
  return prisma.milestone.findMany({
    where: {
      completed: false,
      goal: { userId: user.id, status: "Active" },
    },
    include: { goal: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
  });
}
