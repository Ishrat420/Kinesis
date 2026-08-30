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

export default async function Home() {
  const [upcomingItems, user, milestonesDueSoon, expiringDocuments, attentionItems, goalSummary, activity, financeItems] = await Promise.all([
    getUpcomingAndDue(),
    getCurrentUser(),
    getMilestonesDueSoon(),
    getExpiringDocuments(),
    getNeedsAttention(),
    getGoalDashboardSummary(),
    getRecentActivity(),
    getFinanceItems(),
  ]);
  return (
    <ModuleContent>
      <ModuleHeader title={`Good morning, ${getUserDisplayName(user)}`} />

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
        expiringSoon={expiringDocuments.upcoming.length}
        attentionItems={attentionItems}
        goalsAtRisk={goalSummary.atRisk}
        netCashFlow={getMonthlyCashFlow(financeItems).netCashFlow}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ReminderList items={upcomingItems} />
        <ActivityFeed activity={activity} />
      </div>

      <ModuleGrid />
    </ModuleContent>
  );
}
