import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for a document's detail record. */
export default function DocumentDetailLoading() {
  return (
    <ModuleContent>
      <div className="animate-pulse space-y-4">
        <div className="h-9 w-64 rounded-xl bg-zinc-100" />
        <div className="h-96 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
