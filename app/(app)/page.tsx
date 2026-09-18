import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReminderList } from "@/components/dashboard/ReminderList";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getGoalDashboardSummary, getMilestonesDueSoon } from "@/lib/data/goals";
import { getExpiringDocuments } from "@/lib/data/documents";
import { getNeedsAttention } from "@/lib/data/attention";
import { getRecentActivity } from "@/lib/data/activity";
import { getFinanceItems } from "@/lib/data/finance";
import { getMonthlyCashFlow } from "@/lib/finance";
import { getToday } from "@/lib/format/server";
import { getSettings } from "@/lib/data/settings";
import { getReminderLeadDays } from "@/lib/reminders/policy";

export default async function Home() {
  // getGoalDashboardSummary archives any Active goal past its target date
  // (archiveLapsedGoals) as a side effect of computing itself. Awaiting it
  // alongside getUpcomingAndDue/getNeedsAttention in the same Promise.all
  // would race that write against their own read of the same goals table --
  // KD-028's "the column lags but every reconcile still races the archive"
  // problem -- so those two are read first, guaranteeing they see a goal
  // still Active on the one render that first notices it went overdue.
  const [upcomingItems, attentionItems] = await Promise.all([getUpcomingAndDue(), getNeedsAttention()]);
  const [user, milestonesDueSoon, expiringDocuments, goalSummary, activity, financeItems, settings] = await Promise.all([
    getCurrentUser(),
    getMilestonesDueSoon(),
    getExpiringDocuments(),
    getGoalDashboardSummary(),
    getRecentActivity(),
    getFinanceItems(),
    getSettings(),
  ]);
  const milestoneLeadDays = getReminderLeadDays(settings, "milestone");
  return (
    <ModuleContent>
      <ModuleHeader title={`Welcome, ${getUserDisplayName(user)}`} />

      <div className="mt-4 max-w-2xl" aria-live="polite">
        {attentionItems.length === 0 ? (
          <p className="text-lg font-semibold text-zinc-900">
            <span className="mr-2 text-emerald-600" aria-hidden="true">
              ✓
            </span>
            Nothing to action
          </p>
        ) : (
          <p className="text-lg font-semibold text-zinc-900">
            <span className="text-2xl font-bold">{attentionItems.length}</span>{" "}
            {attentionItems.length === 1 ? "thing needs" : "things need"} your attention.
          </p>
        )}
        <p className="mt-1 text-base leading-7 text-zinc-500">
          {attentionItems.length === 0
            ? "Everything seems under control."
            : "Everything else seems under control."}
        </p>
      </div>

      <StatsGrid
        milestonesDueSoon={milestonesDueSoon.length}
        milestoneLeadDays={milestoneLeadDays}
        expiringSoon={expiringDocuments.upcoming.length}
        attentionItems={attentionItems}
        goalsAtRisk={goalSummary.atRisk}
        netCashFlow={getMonthlyCashFlow(financeItems, await getToday()).netCashFlow}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ReminderList items={upcomingItems} />
        <ActivityFeed activity={activity} />
      </div>

      <ModuleGrid />
    </ModuleContent>
  );
}
