"use client";

import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

export function CreateGoalSubmit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="flex h-12 min-w-40 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-70 sm:h-10">
      <Check className="h-4 w-4" aria-hidden="true" />
      {pending ? "Creating…" : "Create active goal"}
    </button>
  );
}
