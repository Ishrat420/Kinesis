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
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[40px] font-semibold leading-none tracking-tight">
                  Good morning, Ishrat
                </h1>

                <p className="mt-4 max-w-2xl text-lg leading-7 text-zinc-500">
                  Three things need your attention.
                  <br />
                  Everything else is under control.
                </p>
              </div>

              <button className="flex h-12 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-5 text-sm font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
                <Plus className="h-[18px] w-[18px]" />
                Quick capture
              </button>
            </div>

            <StatsGrid />

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ReminderList />
              <ActivityFeed />
            </div>

            <ModuleGrid />
          </div>
        </section>
      </div>
    </main>
  );
}