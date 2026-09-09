/** See app/(app)/settings/loading.tsx -- same reasoning, shaped for a template's detail screen. */
export default function TemplateDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-10 w-72 rounded-xl bg-zinc-100" />
      <div className="h-64 rounded-3xl bg-zinc-100" />
    </div>
  );
}
