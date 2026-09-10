import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for a module's item list. */
export default function CustomModuleLoading() {
  return (
    <ModuleContent width="standard">
      <div className="animate-pulse space-y-3">
        <div className="h-9 w-56 rounded-xl bg-zinc-100" />
        <div className="mt-7 h-20 rounded-2xl bg-zinc-100" />
        <div className="h-20 rounded-2xl bg-zinc-100" />
        <div className="h-20 rounded-2xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
