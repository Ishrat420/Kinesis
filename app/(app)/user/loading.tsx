import { ModuleContent } from "@/components/layout/ModuleContent";

/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for the profile page. */
export default function UserLoading() {
  return (
    <ModuleContent width="narrow">
      <div className="animate-pulse space-y-5">
        <div className="h-9 w-56 rounded-xl bg-zinc-100" />
        <div className="h-24 rounded-3xl bg-zinc-100" />
        <div className="h-40 rounded-3xl bg-zinc-100" />
      </div>
    </ModuleContent>
  );
}
