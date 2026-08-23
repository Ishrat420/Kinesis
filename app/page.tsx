import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReminderList } from "@/components/dashboard/ReminderList";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { getUpcomingAndDue } from "@/lib/data/upcoming";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getGoalDashboardSummary, getMilestonesDueSoon } from "@/lib/data/goals";
import { getExpiringDocuments } from "@/lib/data/documents";
import { getNeedsAttention } from "@/lib/data/attention";
import { getRecentActivity } from "@/lib/data/activity";

export default async function Home() {
  const [upcomingItems, user, milestonesDueSoon, expiringDocuments, attentionItems, goalSummary, activity] = await Promise.all([
    getUpcomingAndDue(),
    getCurrentUser(),
    getMilestonesDueSoon(),
    getExpiringDocuments(),
    getNeedsAttention(),
    getGoalDashboardSummary(),
    getRecentActivity(),
  ]);
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />

      <div className="flex">
        <Sidebar />

        <section className="flex-1 px-10 py-6">
          <div className="max-w-7xl">
            <div>
              <h1 className="text-[38px] font-semibold leading-none tracking-tight">
                Good morning, {getUserDisplayName(user)}
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">
                {attentionItems.length} {attentionItems.length === 1 ? "thing needs" : "things need"} your attention.
                <br />
                Everything else is under control.
              </p>
            </div>

            <StatsGrid
              milestonesDueSoon={milestonesDueSoon.length}
              expiringSoon={expiringDocuments.upcoming.length}
              attentionItems={attentionItems}
              goalsAtRisk={goalSummary.atRisk}
            />

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ReminderList items={upcomingItems} />
              <ActivityFeed activity={activity} />
            </div>

            <ModuleGrid />
          </div>
        </section>
      </div>
    </main>
  );
}
