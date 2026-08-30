"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { createGoalAction, type GoalActionState } from "./actions";
import { CreateGoalSubmit } from "./CreateGoalSubmit";

const initialState: GoalActionState = {};

export function CreateGoalButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createGoalAction, initialState);
  return <>
    <button onClick={() => setOpen(true)} className="flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> Create goal</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 p-5 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><h2 className="text-2xl font-semibold">Create a goal</h2><p className="mt-1 text-sm text-zinc-500">Start simple. You can add the path forward next.</p></div><button onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <form action={formAction} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold">Goal name<input name="name" required autoFocus placeholder="e.g. Buy my first home" className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 px-4 font-normal outline-none focus:border-violet-400" /></label>
          <label className="block text-sm font-semibold">Target date <span className="font-normal text-zinc-400">(optional)</span><div className="relative mt-2"><CalendarDays className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400"/><input name="targetDate" type="date" className="h-12 w-full rounded-2xl border border-zinc-200 pl-12 pr-4 font-normal outline-none focus:border-violet-400" /></div></label>
          <label className="block text-sm font-semibold">Note <span className="font-normal text-zinc-400">(optional)</span><textarea name="note" rows={3} placeholder="Why this matters, or a first thought..." className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 p-4 font-normal outline-none focus:border-violet-400" /></label>
          {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button><CreateGoalSubmit /></div>
        </form>
      </div>
    </div>}
  </>;
}
