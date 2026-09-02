import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { DEFAULT_GOAL_UNITS, effectiveStatus } from "@/lib/goals/format";
import { calculateGoalHealth } from "@/lib/goals/health";
import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getReminderLeadDays, getReminderWindowEnd } from "@/lib/reminders/policy";

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

export async function getGoalRelationships(goalId: string) {
  const user = await requireKinesisUser();
  // Every goal this user owns, including the one being viewed. The list already
  // had to be fetched to offer the picker, so letting it carry objectId makes it
  // the Object -> Goal lookup too, and the far end of a link resolves from data
  // in hand instead of a nested relation on every relationship row.
  const goals = await prisma.goal.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, status: true, objectId: true },
    orderBy: { name: "asc" },
  });
  const objectId = goals.find((goal) => goal.id === goalId)?.objectId;
  if (!objectId) return { linked: [], availableGoals: [] };

  // Addressed by object id: that is what the shared capability stores, and what
  // @@index([userId, sourceObjectId]) and ([userId, targetObjectId]) cover.
  const relationships = await prisma.objectRelationship.findMany({
    where: { userId: user.id, OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] },
    orderBy: { createdAt: "asc" },
  });

  // Keyed by identity and without the goal being viewed, so it answers both
  // "which goal is the other end" and "which goals may still be linked".
  const goalByObjectId = new Map(goals.flatMap(({ objectId: linkedObjectId, ...goal }) =>
    goal.id === goalId ? [] : [[linkedObjectId, goal] as const]));
  const linked = relationships.flatMap((relationship) => {
    const inverse = relationship.targetObjectId === objectId;
    const goal = goalByObjectId.get(inverse ? relationship.sourceObjectId : relationship.targetObjectId);
    return goal ? [{ ...relationship, inverse, goal }] : [];
  });
  const linkedIds = new Set(linked.map(({ goal }) => goal.id));
  return { linked, availableGoals: [...goalByObjectId.values()].filter(({ id }) => !linkedIds.has(id)) };
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
  const settings = await getSettings();
  const today = startOfUtcDay(now)!;
  const windowEnd = getReminderWindowEnd(today, getReminderLeadDays(settings, "milestone"));

  return prisma.milestone.findMany({
    where: {
      completed: false,
      dueDate: { gte: today, lte: windowEnd },
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
