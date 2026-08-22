import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, CalendarDays, Check, Circle, Flag, Gauge, RotateCcw, Target, Trash2 } from "lucide-react";
import { getGoal, getGoalUnits } from "@/lib/data/goals";
import { displayNumber, remainingLabel } from "@/lib/goals/format";
import { addMilestoneAction, addTargetAction, deleteGoalAction, deleteMilestoneAction, removeMilestoneDueDateAction, removeTargetAction, toggleMilestoneAction, toggleProgressAction, updateGoalStatusAction, updateMilestoneDueDateAction } from "../actions";
import { GoalStatusSelect } from "./GoalStatusSelect";
import { AddMilestoneForm, MeasurableTargetForm, MilestoneDueDateForm } from "./GoalAddForms";
import { calculateGoalHealth } from "@/lib/goals/health";

export default async function GoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const [goal, units] = await Promise.all([getGoal(goalId), getGoalUnits()]);
  if (!goal) notFound();
  const completed = goal.milestones.filter((item) => item.completed).length;
  const milestonePercent = goal.milestones.length ? Math.round(completed / goal.milestones.length * 100) : 0;
  const targetPercent = goal.targetValue ? Math.min(100, Math.max(0, Math.round((goal.currentValue ?? 0) / goal.targetValue * 100))) : 0;
  const statusAction = updateGoalStatusAction.bind(null, goal.id);
  const targetAction = addTargetAction.bind(null, goal.id);
  const milestoneAction = addMilestoneAction.bind(null, goal.id);
  const health = goal.targetValue !== null && goal.currentValue !== null && goal.targetDate
    ? calculateGoalHealth({ targetValue: goal.targetValue, currentValue: goal.currentValue, targetDate: goal.targetDate, unit: goal.unit, history: goal.metricHistory })
    : null;
  const now = new Date();
  const overdueMilestones = goal.milestones.filter((milestone) => !milestone.completed && milestone.dueDate && milestone.dueDate < now);
  const hasMilestoneRisk = overdueMilestones.length > 0;

  return <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-zinc-950 md:px-10"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/goals" className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"><ArrowLeft className="h-5 w-5"/> All goals</Link><div className="flex gap-3"><GoalStatusSelect status={goal.status} action={statusAction} /><form action={deleteGoalAction.bind(null, goal.id)}><button className="flex h-11 items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/> Delete</button></form></div></div>

    <header className="mt-8 rounded-3xl bg-zinc-950 p-7 text-white shadow-xl md:p-9"><div className="flex items-start gap-5"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-400/20"><Target className="h-7 w-7 text-violet-300"/></div><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-zinc-400">{goal.status} goal</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{goal.name}</h1>{goal.note && <p className="mt-3 max-w-3xl leading-7 text-zinc-300">{goal.note}</p>}<div className="mt-5 flex items-center gap-2 text-sm text-zinc-300"><CalendarDays className="h-4 w-4"/>{goal.targetDate ? <><span>Target · {goal.targetDate.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })}</span><span className="text-zinc-600">•</span><strong className="font-medium text-violet-300">{remainingLabel(goal.targetDate)}</strong></> : <span>No target date</span>}</div></div></div></header>

    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]"><div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Milestones</h2><p className="mt-1 text-sm text-zinc-500">Your current understanding of the path forward.</p></div><Flag className="h-5 w-5 text-violet-500"/></div>
        <div className="mt-5 space-y-2">{goal.milestones.map((milestone) => <div key={milestone.id} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${milestone.completed ? "border-emerald-100 bg-emerald-50/60" : "border-zinc-200"}`}><form action={toggleMilestoneAction.bind(null, goal.id, milestone.id, !milestone.completed)}><button className="text-zinc-400">{milestone.completed ? <Check className="h-6 w-6 rounded-full bg-emerald-500 p-1 text-white"/> : <Circle className="h-6 w-6"/>}</button></form><div className="min-w-0 flex-1"><p className={`font-medium ${milestone.completed ? "text-zinc-500 line-through" : ""}`}>{milestone.name}</p>{milestone.value !== null && <p className="text-xs text-zinc-500">Reach {displayNumber(milestone.value, goal.unit)}</p>}<MilestoneDueDateForm action={updateMilestoneDueDateAction.bind(null, goal.id, milestone.id)} removeAction={removeMilestoneDueDateAction.bind(null, goal.id, milestone.id)} dueDate={milestone.dueDate} />{milestone.autoCompleted && <p className="mt-1 text-xs font-medium text-emerald-600">Completed automatically · choose undo to reopen</p>}</div>{milestone.autoCompleted && <form action={toggleMilestoneAction.bind(null, goal.id, milestone.id, false)}><button title="Undo" className="rounded-lg p-2 text-zinc-400 hover:bg-white"><RotateCcw className="h-4 w-4"/></button></form>}<form action={deleteMilestoneAction.bind(null, goal.id, milestone.id)}><button className="rounded-lg p-2 text-zinc-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4"/></button></form></div>)}{!goal.milestones.length && <div className="rounded-2xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-400">Break your goal into meaningful checkpoints.</div>}</div>
        <AddMilestoneForm action={milestoneAction} hasTarget={goal.targetValue !== null} />
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Measurable target</h2><p className="mt-1 text-sm text-zinc-500">Track the number that defines success.</p></div><Gauge className="h-5 w-5 text-violet-500"/></div>
        <MeasurableTargetForm action={targetAction} removeAction={removeTargetAction.bind(null, goal.id)} units={units} targetValue={goal.targetValue} currentValue={goal.currentValue} unit={goal.unit} />
      </section>
      {(health || hasMilestoneRisk) && <section className={`rounded-3xl border p-6 shadow-sm ${hasMilestoneRisk || health?.tone === "risk" ? "border-amber-200 bg-amber-50" : health?.tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-violet-200 bg-violet-50"}`}>
        <div className="flex items-start gap-4"><div className="rounded-2xl bg-white/80 p-3"><Activity className={`h-5 w-5 ${hasMilestoneRisk || health?.tone === "risk" ? "text-amber-600" : health?.tone === "good" ? "text-emerald-600" : "text-violet-600"}`}/></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-600">Goal health</p><h2 className="mt-2 text-xl font-bold">{hasMilestoneRisk ? "AT RISK" : health?.status}</h2>{health && <p className="mt-2 leading-6 text-zinc-700">{health.message}</p>}{overdueMilestones.map((milestone) => <p key={milestone.id} className="mt-2 font-medium leading-6 text-amber-800">Milestone “{milestone.name}” is past its due date.</p>)}{health?.actualPace === null && <p className="mt-3 text-xs text-zinc-500">Update your current value over time and Kinesis will average your pace automatically.</p>}</div></div>
      </section>}
    </div>

    <aside><section className="sticky top-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Progress</h2><p className="mt-1 text-sm text-zinc-500">Use one or both views.</p><div className="mt-6 space-y-7">
      <Progress title="Milestones" percent={milestonePercent} detail={`${completed} of ${goal.milestones.length} complete`} shown={goal.showMilestoneProgress} toggle={toggleProgressAction.bind(null, goal.id, "showMilestoneProgress", !goal.showMilestoneProgress)} />
      {goal.targetValue !== null && <Progress title={goal.unit || "Target unit"} percent={targetPercent} detail={`${displayNumber(goal.currentValue ?? 0, goal.unit)} of ${displayNumber(goal.targetValue, goal.unit)} · ${targetPercent}%`} shown={goal.showTargetProgress} toggle={toggleProgressAction.bind(null, goal.id, "showTargetProgress", !goal.showTargetProgress)} />}
    </div></section></aside></div>
  </div></main>;
}

function Progress({ title, percent, detail, shown, toggle }: { title: string; percent: number; detail: string; shown: boolean; toggle: () => Promise<void> }) {
  return <div className={!shown ? "opacity-50" : ""}><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">{title}</span><form action={toggle}><button className="text-xs font-medium text-zinc-400 hover:text-zinc-700">{shown ? "Remove" : "Add"}</button></form></div>{shown && <><div className="h-3 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{width:`${percent}%`}}/></div><p className="mt-2 text-sm text-zinc-500">{detail}</p></>}</div>;
}
