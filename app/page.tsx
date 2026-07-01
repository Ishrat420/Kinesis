import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReminderList } from "@/components/dashboard/ReminderList";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />

      <div className="flex">
        <Sidebar />

      <section className="flex-1 px-10 py-8">
        <div className="mx-auto max-w-6xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Good morning, Ishrat 👋
                </h1>
                <p className="mt-2 text-zinc-500">
                  Three things need your attention. Everything else is under
                  control.
                </p>
              </div>

              <button className="rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-sm font-medium shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-zinc-50">
                + Quick capture
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