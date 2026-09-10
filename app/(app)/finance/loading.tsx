import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the finance dashboard. */
export default function FinanceLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse space-y-5">
        <div className="h-52 rounded-3xl bg-zinc-900/10" />
        <div className="grid gap-5 md:grid-cols-3">
          <div className="h-28 rounded-3xl bg-zinc-100" />
          <div className="h-28 rounded-3xl bg-zinc-100" />
          <div className="h-28 rounded-3xl bg-zinc-100" />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="h-72 rounded-3xl bg-zinc-100" />
          <div className="h-72 rounded-3xl bg-zinc-100" />
        </div>
      </div>
    </ModuleContent>
  );
}
