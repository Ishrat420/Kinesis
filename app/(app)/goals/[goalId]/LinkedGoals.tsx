"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowUpRight, Link2, Plus, Trash2 } from "lucide-react";
import { GOAL_RELATIONSHIP_TYPES, relationshipLabel, type GoalRelationshipType } from "@/lib/goals/relationships";
import type { GoalActionState } from "../actions";

type GoalOption = { id: string; name: string; status: string };
type LinkedGoal = { id: string; type: GoalRelationshipType; inverse: boolean; goal: GoalOption };

export function LinkedGoals({ linked, availableGoals, addAction, updateAction, removeAction }: {
  linked: LinkedGoal[];
  availableGoals: GoalOption[];
  addAction: (state: GoalActionState, data: FormData) => Promise<GoalActionState>;
  updateAction: (relationshipId: string, data: FormData) => Promise<void>;
  removeAction: (relationshipId: string) => Promise<void>;
}) {
  const [state, formAction] = useActionState(addAction, {});
  return <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Linked Goals</h2><p className="mt-1 text-sm text-zinc-500">Independent goals that affect or progress with this one.</p></div><Link2 className="h-5 w-5 text-violet-500" /></div>
    <div className="mt-5 space-y-3">
      {linked.map((relationship) => <div key={relationship.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 sm:flex-row sm:items-center">
        <form action={updateAction.bind(null, relationship.id)}>
          <select name="type" aria-label={`Relationship to ${relationship.goal.name}`} defaultValue={relationship.type} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-violet-700 outline-none focus:border-violet-400">
            {GOAL_RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{relationshipLabel(type, relationship.inverse)}</option>)}
          </select>
        </form>
        <Link href={`/goals/${relationship.goal.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-zinc-900 hover:text-violet-700"><ArrowUpRight className="h-4 w-4 shrink-0" /><span className="truncate">{relationship.goal.name}</span>{relationship.goal.status === "Archived" && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500">Archived</span>}</Link>
        <form action={removeAction.bind(null, relationship.id)}><button aria-label={`Remove link to ${relationship.goal.name}`} className="rounded-xl p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></form>
      </div>)}
      {!linked.length && <div className="rounded-2xl border border-dashed border-zinc-200 py-7 text-center text-sm text-zinc-400">No linked goals yet.</div>}
    </div>
    {availableGoals.length ? <form action={formAction} className="mt-4 grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <select name="type" aria-label="Relationship type" defaultValue="SUPPORTS" className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-400">{GOAL_RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{relationshipLabel(type)}</option>)}</select>
      <select name="targetGoalId" required aria-label="Goal to link" defaultValue="" className="h-11 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400"><option value="" disabled>Select a goal</option>{availableGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}{goal.status === "Archived" ? " (Archived)" : ""}</option>)}</select>
      <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Link</button>
      {state.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{state.error}</p>}
    </form> : linked.length > 0 && <p className="mt-4 text-sm text-zinc-400">All other goals are already linked.</p>}
  </section>;
}
