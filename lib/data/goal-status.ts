import { prisma } from "./prisma";

/**
 * Writes the lapse that `activeGoalWhere` already applies.
 *
 * Readers no longer wait for this -- they filter on the target date itself --
 * but the goal's own status chip reads the stored column, so it is brought up
 * to date wherever a goal is about to be shown, and by the notification engine
 * on its daily pass so it converges without anyone opening a page.
 *
 * It lives apart from the rest of the goal queries because the engine calls it
 * too, and `lib/data/goals.ts` reaches for `next/server` and the auth layer
 * that a cron process has no request context for.
 */
export function archiveLapsedGoals(userId: string, now = new Date()) {
  return prisma.goal.updateMany({
    where: { userId, status: "Active", targetDate: { lt: now } },
    data: { status: "Archived" },
  });
}
