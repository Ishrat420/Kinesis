import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the map canvas. */
export default function RelationshipsLoading() {
  return (
    <ModuleContent width="full">
      <div className="h-[720px] animate-pulse rounded-3xl bg-zinc-100" />
    </ModuleContent>
  );
}
