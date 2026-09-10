import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the to-do board. */
export default function TodosLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse space-y-5">
        <div className="h-9 w-40 rounded-xl bg-zinc-100" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-24 rounded-3xl bg-zinc-100" />
          <div className="h-24 rounded-3xl bg-zinc-100" />
          <div className="h-24 rounded-3xl bg-zinc-100" />
        </div>
        <div className="h-96 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
