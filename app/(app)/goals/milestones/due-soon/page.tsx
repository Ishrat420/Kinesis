import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckSquare, ListFilter, Target, X } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getActiveIncompleteMilestones } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/settings";
import { formatDate, formatDeadline, startOfUtcDay } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
import {
  MILESTONES_ALL_HREF,
  MILESTONES_DUE_SOON_HREF,
  MILESTONE_DUE_SOON_FILTER,
  milestoneDueSoonLabel,
  milestoneDueSoonWindow,
  milestoneLists,
} from "@/lib/goals/milestone-window";
import { getReminderLeadDays } from "@/lib/reminders/policy";

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

/**
 * The due-soon filter, in whichever state it is currently in.
 *
 * Both states are plain links rather than client state: the dashboard tile
 * needs to be able to link straight to the filtered view, so the filter lives
 * in the URL and the page stays a Server Component.
 */
function DueSoonFilter({ active, label, hidden }: { active: boolean; label: string; hidden: number }) {
  if (!active) {
    return (
      <Link
        href={MILESTONES_DUE_SOON_HREF}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
      >
        <ListFilter className="h-4 w-4" />
        Only due within {label}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 py-2 pl-3.5 pr-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
        Due within {label}
        <Link
          href={MILESTONES_ALL_HREF}
          aria-label={`Remove the due within ${label} filter`}
          className="rounded-full p-1 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
        >
          <X className="h-3.5 w-3.5" />
        </Link>
      </span>
      {hidden > 0 && (
        <Link href={MILESTONES_ALL_HREF} className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
          {hidden} more outside this window →
        </Link>
      )}
    </div>
  );
}

export default async function MilestonesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const [params, milestones, settings, { locale }] = await Promise.all([
    searchParams,
    getActiveIncompleteMilestones(),
    getSettings(),
    getFormatPreferences(),
  ]);
  const dueSoonOnly = params.filter === MILESTONE_DUE_SOON_FILTER;
  const leadDays = getReminderLeadDays(settings, "milestone");
  const label = milestoneDueSoonLabel(leadDays);
  const today = startOfUtcDay(new Date())!;
  const { overdue, upcoming, hiddenByFilter } = milestoneLists(milestones, today, milestoneDueSoonWindow(today, leadDays), dueSoonOnly);

  return (
    <ModuleContent width="standard">
      <ModuleHeader
        backHref="/goals"
        backLabel="Back to goals"
        breadcrumbs={[{ label: "Goals", href: "/goals" }, { label: "Milestones" }]}
        icon={<CheckSquare className="h-6 w-6" />}
        iconClassName="bg-emerald-50 text-emerald-700"
        title="Milestones"
        description={dueSoonOnly
          ? `Milestones due in the next ${label}. Anything overdue is listed regardless.`
          : "All incomplete milestones from your active goals."}
      />

      <div className="mt-7">
        <DueSoonFilter active={dueSoonOnly} label={label} hidden={hiddenByFilter} />
      </div>

      <div className="mt-5 space-y-5">
        <MilestoneSection
          title="Upcoming"
          emptyMessage={dueSoonOnly ? `No milestones due in the next ${label}.` : "No upcoming milestones."}
          milestones={upcoming}
          now={today}
          locale={locale}
        />
        <MilestoneSection title="Overdue" emptyMessage="No overdue milestones." milestones={overdue} now={today} locale={locale} overdue />
      </div>
    </ModuleContent>
  );
}
