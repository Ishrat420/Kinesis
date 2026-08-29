import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckSquare, Target } from "lucide-react";
import { getActiveIncompleteMilestones } from "@/lib/data/goals";
import { formatDate, formatDeadline, startOfUtcDay } from "@/lib/dates";

type MilestoneList = Awaited<ReturnType<typeof getActiveIncompleteMilestones>>;

function MilestoneSection({
  title,
  emptyMessage,
  milestones,
  now,
  overdue = false,
}: {
  title: string;
  emptyMessage: string;
  milestones: MilestoneList;
  now: Date;
  overdue?: boolean;
}) {
  const Icon = overdue ? AlertTriangle : CalendarDays;

  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${overdue ? "text-rose-600" : "text-zinc-500"}`} />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">
          {milestones.length}
        </span>
      </div>

      {milestones.length ? (
        <div className="divide-y divide-zinc-100">
          {milestones.map((milestone) => (
            <Link
              key={milestone.id}
              href={`/goals/${milestone.goal.id}`}
              className="group flex items-center gap-4 py-4 first:pt-1 last:pb-0"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${overdue ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700"}`}>
                <Target className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{milestone.name}</p>
                <p className="mt-1 truncate text-sm text-zinc-500">{milestone.goal.name}</p>
              </div>
              {milestone.dueDate ? (
                <time
                  className={`shrink-0 text-sm font-medium ${overdue ? "text-rose-600" : "text-zinc-600"}`}
                  dateTime={milestone.dueDate.toISOString()}
                >
                  {formatDate(milestone.dueDate)} · {formatDeadline(milestone.dueDate, now)}
                </time>
              ) : (
                <span className="shrink-0 text-sm text-zinc-400">No due date</span>
              )}
              <span className="text-xl text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-400">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default async function MilestonesPage() {
  const milestones = await getActiveIncompleteMilestones();
  const today = startOfUtcDay(new Date())!;
  const overdue = milestones.filter((milestone) => milestone.dueDate && milestone.dueDate < today);
  const upcoming = milestones.filter((milestone) => !milestone.dueDate || milestone.dueDate >= today);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-zinc-950 md:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50">
          <ArrowLeft className="h-5 w-5" /> Back to dashboard
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckSquare className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[38px] font-semibold leading-none tracking-tight">Milestones</h1>
            <p className="mt-3 text-base leading-7 text-zinc-500">All incomplete milestones from your active goals.</p>
          </div>
        </div>

        <div className="mt-9 space-y-5">
          <MilestoneSection title="Upcoming" emptyMessage="No upcoming milestones." milestones={upcoming} now={today} />
          <MilestoneSection title="Overdue" emptyMessage="No overdue milestones." milestones={overdue} now={today} overdue />
        </div>
      </div>
    </main>
  );
}
