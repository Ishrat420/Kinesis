import { ModuleContent } from "@/components/layout/ModuleContent";

/**
 * Skeleton for a goal while it loads. The application shell stays mounted
 * around it, so this only stands in for the page content.
 */
export default function GoalLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse">
        <div className="h-11 w-32 rounded-xl bg-zinc-200" />
        <div className="mt-8 h-52 rounded-3xl bg-zinc-900" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="h-96 rounded-3xl bg-white" />
          <div className="h-72 rounded-3xl bg-white" />
        </div>
      </div>
    </ModuleContent>
  );
}
