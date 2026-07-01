import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReminderList } from "@/components/dashboard/ReminderList";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { Plus } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />

      <div className="flex">
        <Sidebar />

        <section className="flex-1 px-10 py-8">
          <div className="max-w-7xl">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[42px] font-semibold tracking-tight leading-none">
                  Good morning, Ishrat 👋
                </h1>

                <p className="mt-3 text-lg text-zinc-500">
                  Three things need your attention. Everything else is under
                  control.
                </p>
              </div>

              <button className="flex h-12 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
                <Plus className="h-5 w-5" />
                Quick capture
              </button>
            </div>

            {/* KPI cards */}
            <StatsGrid />

            {/* Main content */}
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ReminderList />
              <ActivityFeed />
            </div>

            {/* Modules */}
            <ModuleGrid />
          </div>
        </section>
      </div>
    </main>
  );
}