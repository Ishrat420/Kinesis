import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the dashboard. */
export default function DashboardLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse space-y-5">
        <div className="h-9 w-72 rounded-xl bg-zinc-100" />
        <div className="h-14 w-96 max-w-full rounded-xl bg-zinc-100" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-28 rounded-2xl bg-zinc-100" />
          <div className="h-28 rounded-2xl bg-zinc-100" />
          <div className="h-28 rounded-2xl bg-zinc-100" />
          <div className="h-28 rounded-2xl bg-zinc-100" />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="h-80 rounded-3xl bg-zinc-100" />
          <div className="h-80 rounded-3xl bg-zinc-100" />
        </div>
        <div className="h-48 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
