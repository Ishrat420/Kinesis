/**
 * Skeleton for a goal while it loads. It mirrors the shape of the standard
 * module shell — top bar, sidebar, content — so navigation does not appear to
 * jump around between the loading and loaded states.
 */
export default function GoalLoading() {
  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="h-[72px] border-b border-zinc-200/80 bg-white" />

      <div className="flex animate-pulse">
        <div className="hidden min-h-[calc(100vh-72px)] w-[270px] shrink-0 border-r border-zinc-200/80 bg-white px-5 py-5 md:block">
          <div className="h-[52px] w-[52px] rounded-2xl bg-zinc-100" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-10 rounded-2xl bg-zinc-100" />
            ))}
          </div>
        </div>

        <section className="min-w-0 flex-1 px-6 py-8 md:px-10">
          <div className="max-w-7xl">
            <div className="h-11 w-32 rounded-xl bg-zinc-200" />
            <div className="mt-8 h-52 rounded-3xl bg-zinc-900" />
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="h-96 rounded-3xl bg-white" />
              <div className="h-72 rounded-3xl bg-white" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
