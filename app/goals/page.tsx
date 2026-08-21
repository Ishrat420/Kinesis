import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Target } from "lucide-react";
import { syncAndGetGoals } from "@/lib/data/goals";
import { CreateGoalButton } from "./CreateGoalButton";

const groups = [
  { name: "Active goals", status: "Active", icon: Target, tone: "bg-violet-50 text-violet-700" },
  { name: "Revisit later", status: "Revisit Later", icon: Clock3, tone: "bg-amber-50 text-amber-700" },
  { name: "Finished goals", status: "Finished", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  { name: "Archived", status: "Archived", icon: CalendarDays, tone: "bg-zinc-100 text-zinc-600" },
];

export default async function GoalsPage() {
  const goals = await syncAndGetGoals();
  return <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-zinc-950 md:px-10"><div className="mx-auto max-w-7xl">
    <div className="flex items-start justify-between gap-5"><div><Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"><ArrowLeft className="h-5 w-5"/> Back to dashboard</Link><h1 className="text-[38px] font-semibold leading-none tracking-tight">Goals</h1><p className="mt-3 text-base leading-7 text-zinc-500">Turn what matters into a path you can see.<br/>Keep the next meaningful milestone in view.</p></div><CreateGoalButton /></div>
    <div className="mt-9 space-y-7">{groups.map((group) => { const items = goals.filter((goal) => goal.status === group.status); const Icon = group.icon; return <section key={group.status} className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${group.tone}`}><Icon className="h-5 w-5"/></div><h2 className="text-lg font-semibold">{group.name}</h2><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">{items.length}</span></div>
      {items.length ? <div className="space-y-3">{items.map((goal) => { const done = goal.milestones.filter((item) => item.completed).length; const percent = goal.milestones.length ? Math.round(done / goal.milestones.length * 100) : 0; return <Link key={goal.id} href={`/goals/${goal.id}`} className="group grid items-center gap-4 rounded-2xl border border-zinc-200/80 p-4 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md md:grid-cols-[44px_1fr_190px_40px]"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${group.tone}`}><Target className="h-5 w-5"/></div><div><p className="font-semibold">{goal.name}</p><p className="mt-1 line-clamp-1 text-sm text-zinc-500">{goal.note || "No note added"}</p></div><div><div className="mb-2 flex justify-between text-xs text-zinc-500"><span>{goal.milestones.length ? `${done} of ${goal.milestones.length} milestones` : "No milestones yet"}</span><span>{percent}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-violet-500" style={{width:`${percent}%`}}/></div></div><span className="text-xl text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">→</span></Link>})}</div> : <div className="rounded-2xl border border-dashed border-zinc-200 py-7 text-center text-sm text-zinc-400">No {group.name.toLowerCase()} yet.</div>}
    </section>})}</div>
  </div></main>;
}
