import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckSquare, Target } from "lucide-react";
import { getMilestonesDueSoon } from "@/lib/data/goals";

const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function MilestonesDueSoonPage() {
  const milestones = await getMilestonesDueSoon();

  return <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-zinc-950 md:px-10"><div className="mx-auto max-w-5xl">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"><ArrowLeft className="h-5 w-5" /> Back to dashboard</Link>
    <div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckSquare className="h-6 w-6" /></div><div><h1 className="text-[38px] font-semibold leading-none tracking-tight">Milestones due soon</h1><p className="mt-3 text-base leading-7 text-zinc-500">Incomplete milestones from active goals that are due within the next month.</p></div></div>
    <section className="mt-9 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center gap-3"><CalendarDays className="h-5 w-5 text-zinc-500" /><h2 className="text-lg font-semibold">Upcoming</h2><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">{milestones.length}</span></div>
      {milestones.length ? <div className="divide-y divide-zinc-100">{milestones.map((milestone) => <Link key={milestone.id} href={`/goals/${milestone.goal.id}`} className="group flex items-center gap-4 py-4 first:pt-1 last:pb-0"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><Target className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{milestone.name}</p><p className="mt-1 truncate text-sm text-zinc-500">{milestone.goal.name}</p></div><time className="shrink-0 text-sm font-medium text-zinc-600" dateTime={milestone.dueDate!.toISOString()}>{dateFormatter.format(milestone.dueDate!)}</time><span className="text-xl text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">→</span></Link>)}</div> : <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center"><p className="font-medium text-zinc-600">Nothing due in the next month</p><p className="mt-1 text-sm text-zinc-400">Your active goals have no upcoming incomplete milestones.</p></div>}
    </section>
  </div></main>;
}
