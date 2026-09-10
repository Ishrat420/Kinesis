import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for an item's detail record. */
export default function CustomItemLoading() {
  return (
    <ModuleContent width="standard">
      <div className="animate-pulse space-y-4">
        <div className="h-9 w-64 rounded-xl bg-zinc-100" />
        <div className="h-72 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
