import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckSquare, Target } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getActiveIncompleteMilestones } from "@/lib/data/goals";
import { formatDate, formatDeadline, startOfUtcDay } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";

type MilestoneList = Awaited<ReturnType<typeof getActiveIncompleteMilestones>>;

function MilestoneSection({
  title,
  emptyMessage,
  milestones,
  now,
  locale,
  overdue = false,
}: {
  title: string;
  emptyMessage: string;
  milestones: MilestoneList;
  now: Date;
  locale: string;
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
                  {formatDate(milestone.dueDate, locale)} · {formatDeadline(milestone.dueDate, now)}
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
  const [milestones, { locale }] = await Promise.all([
    getActiveIncompleteMilestones(),
    getFormatPreferences(),
  ]);
  const today = startOfUtcDay(new Date())!;
  const overdue = milestones.filter((milestone) => milestone.dueDate && milestone.dueDate < today);
  const upcoming = milestones.filter((milestone) => !milestone.dueDate || milestone.dueDate >= today);

  return (
    <ModuleContent width="standard">
      <ModuleHeader
        backHref="/goals"
        backLabel="Back to goals"
        breadcrumbs={[{ label: "Goals", href: "/goals" }, { label: "Milestones" }]}
        icon={<CheckSquare className="h-6 w-6" />}
        iconClassName="bg-emerald-50 text-emerald-700"
        title="Milestones"
        description="All incomplete milestones from your active goals."
      />

      <div className="mt-9 space-y-5">
        <MilestoneSection title="Upcoming" emptyMessage="No upcoming milestones." milestones={upcoming} now={today} locale={locale} />
        <MilestoneSection title="Overdue" emptyMessage="No overdue milestones." milestones={overdue} now={today} locale={locale} overdue />
      </div>
    </ModuleContent>
  );
}
