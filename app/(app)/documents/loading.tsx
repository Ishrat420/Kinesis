import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the documents list. */
export default function DocumentsLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse space-y-5">
        <div className="h-9 w-56 rounded-xl bg-zinc-100" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-3xl bg-zinc-100" />
          <div className="h-28 rounded-3xl bg-zinc-100" />
          <div className="h-28 rounded-3xl bg-zinc-100" />
        </div>
        <div className="space-y-3">
          <div className="h-20 rounded-2xl bg-zinc-100" />
          <div className="h-20 rounded-2xl bg-zinc-100" />
          <div className="h-20 rounded-2xl bg-zinc-100" />
        </div>
      </div>
    </ModuleContent>
  );
}
