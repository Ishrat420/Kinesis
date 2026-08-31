"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowUpRight, Link2, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
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
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveRelationship = async (relationshipId: string, data: FormData) => {
    await updateAction(relationshipId, data);
    setEditingId(null);
  };

  return <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Linked Goals</h2><p className="mt-1 text-sm text-zinc-500">Independent goals that affect or progress with this one.</p></div><Link2 className="h-5 w-5 text-zinc-400" /></div>
    <div className="mt-5 space-y-3">
      {linked.map((relationship) => <div key={relationship.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 sm:flex-row sm:items-center">
        {editingId === relationship.id ? <form action={saveRelationship.bind(null, relationship.id)} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <select name="type" aria-label={`Relationship to ${relationship.goal.name}`} defaultValue={relationship.type} className="h-10 min-w-44 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 outline-none focus:border-zinc-500">
            {GOAL_RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{relationshipLabel(type, relationship.inverse)}</option>)}
          </select>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{relationship.goal.name}</span>
          <button className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Save</button>
          <button type="button" onClick={() => setEditingId(null)} className="flex h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /> Cancel</button>
        </form> : <>
          <span className="w-fit rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600">{relationshipLabel(relationship.type, relationship.inverse)}</span>
          <Link href={`/goals/${relationship.goal.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-zinc-900 hover:text-zinc-600"><span className="truncate">{relationship.goal.name}</span>{relationship.goal.status === "Archived" && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500">Archived</span>}<ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400" /></Link>
          <details className="relative">
            <summary aria-label={`Actions for link to ${relationship.goal.name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-5 w-5" /></summary>
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
              <button type="button" onClick={() => setEditingId(relationship.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100"><Pencil className="h-4 w-4" /> Change relationship</button>
              <form action={removeAction.bind(null, relationship.id)}><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Remove link</button></form>
            </div>
          </details>
        </>}
      </div>)}
      {!linked.length && <div className="rounded-2xl border border-dashed border-zinc-200 py-7 text-center text-sm text-zinc-400">No linked goals yet.</div>}
    </div>
    {availableGoals.length > 0 && (!creating ? <button type="button" onClick={() => setCreating(true)} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"><Plus className="h-4 w-4" /> Link goal</button> : <form action={formAction} className="mt-4 grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <select name="type" aria-label="Relationship type" defaultValue="SUPPORTS" className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium outline-none focus:border-zinc-500">{GOAL_RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{relationshipLabel(type)}</option>)}</select>
      <select name="targetGoalId" required aria-label="Goal to link" defaultValue="" className="h-11 min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-500"><option value="" disabled>Select a goal</option>{availableGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}{goal.status === "Archived" ? " (Archived)" : ""}</option>)}</select>
      <div className="flex gap-2"><button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Link goal</button><button type="button" onClick={() => setCreating(false)} aria-label="Cancel linking goal" className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-200"><X className="h-4 w-4" /></button></div>
      {state.error && <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-3">{state.error}</p>}
    </form>)}
  </section>;
}
