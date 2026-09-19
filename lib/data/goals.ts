import type { FieldLink, ObjectField } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { presentCustomFields } from "@/lib/custom-fields/present";
import { DEFAULT_GOAL_UNITS } from "@/lib/goals/format";
import { calculateGoalHealth } from "@/lib/goals/health";
import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import { milestoneDueSoonWindow } from "@/lib/goals/milestone-window";
import { getReminderLeadDays } from "@/lib/reminders/policy";
import { activeGoalWhere } from "@/lib/goals/active";
import { getToday } from "@/lib/format/server";

/** Every goal this user owns. No archive-on-read (KD-028): a goal's status is only ever what was last set, by hand. */
export async function getGoals() {
  await connection();
  const user = await requireKinesisUser();
  return prisma.goal.findMany({ where: { userId: user.id }, include: { milestones: true, metricHistory: { orderBy: { recordedAt: "asc" } } }, orderBy: { updatedAt: "desc" } });
}

/** Presents a goal the way every caller of this file already expects: `customFields` as its own flat array. */
function withCustomFields<T extends { object: { fields: (ObjectField & { links: FieldLink[] })[] } }>({ object, ...goal }: T) {
  return { ...goal, customFields: presentCustomFields(object.fields) };
}

export async function getGoal(id: string) {
  const user = await requireKinesisUser();
  const include = {
    // Incomplete milestones first (so a finished one doesn't outrank what's
    // actually next), then nearest due date, matching getMilestonesDueSoon
    // and getActiveIncompleteMilestones below. Position remains the
    // tiebreak for same-day/no-date milestones.
    milestones: { orderBy: [{ completed: "asc" as const }, { dueDate: { sort: "asc" as const, nulls: "last" as const } }, { position: "asc" as const }] },
    metricHistory: { orderBy: { recordedAt: "asc" as const } },
    object: { select: { fields: { orderBy: { position: "asc" as const }, include: { links: { orderBy: { position: "asc" as const } } } } } },
  };
  const goal = await prisma.goal.findFirst({ where: { id, userId: user.id }, include });
  if (!goal) return null;
  return withCustomFields(goal);
}

export async function getGoalUnits() {
  const user = await requireKinesisUser();
  const custom = await prisma.goalUnit.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  return [...new Set([...DEFAULT_GOAL_UNITS, ...custom.map(({ name }) => name)])];
}

export async function getGoalsForLinking() {
  await connection();
  const user = await requireKinesisUser();
  return prisma.goal.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getGoalDashboardSummary(now = new Date()) {
  await connection();
  const user = await requireKinesisUser();
  const today = await getToday(now);

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, ...activeGoalWhere() },
    include: { metricHistory: { orderBy: { recordedAt: "asc" } }, milestones: { select: { completed: true, dueDate: true } } },
  });

  const atRisk = goals.filter((goal) => {
    if (goal.milestones.some((milestone) => !milestone.completed && milestone.dueDate && milestone.dueDate < today)) return true;
    if (goal.targetValue === null || goal.currentValue === null || !goal.targetDate) return false;
    if (goal.currentValue === goal.targetValue) return false;

    const health = calculateGoalHealth({
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      targetDate: goal.targetDate,
      unit: goal.unit,
      history: goal.metricHistory,
      today,
    });
    return health?.status === "AT RISK";
  }).length;

  return { active: goals.length, atRisk };
}

export async function getMilestonesDueSoon(now = new Date()) {
  await connection();
  const user = await requireKinesisUser();
  const settings = await getSettings();
  const today = await getToday(now);
  // The same window the milestones page filters by, so the tile's number and
  // the list behind "See all" can never describe different sets.
  const window = milestoneDueSoonWindow(today, getReminderLeadDays(settings, "milestone"));

  return prisma.milestone.findMany({
    where: {
      completed: false,
      dueDate: { gte: window.from, lte: window.to },
      goal: { userId: user.id, ...activeGoalWhere() },
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
      goal: { userId: user.id, ...activeGoalWhere() },
    },
    include: { goal: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
  });
}
