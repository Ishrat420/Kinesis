"use client";

import { useFormStatus } from "react-dom";

export function CreateGoalSubmit() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="min-w-40 rounded-2xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70">{pending ? "Creating…" : "Create active goal"}</button>;
}
