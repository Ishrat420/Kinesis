import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the upcoming/expired sections. */
export default function ExpiringDocumentsLoading() {
  return (
    <ModuleContent width="standard">
      <div className="animate-pulse space-y-5">
        <div className="h-9 w-64 rounded-xl bg-zinc-100" />
        <div className="h-48 rounded-3xl bg-zinc-100" />
        <div className="h-48 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
