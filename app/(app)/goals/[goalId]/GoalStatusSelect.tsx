"use client";

import { ChevronDown } from "lucide-react";
import { GOAL_STATUSES } from "@/lib/goals/format";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState } from "react";
import type { GoalActionState } from "../actions";

const initialState: GoalActionState = {};

export function GoalStatusSelect({
  status,
  action,
}: {
  status: string;
  action: (state: GoalActionState, formData: FormData) => Promise<GoalActionState>;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);

  const updateStatus = useCallback(
    async (state: GoalActionState, formData: FormData) => {
      const result = await action(state, formData);
      if (result.error) setSelectedStatus(status);
      else router.refresh();
      return result;
    },
    [action, router, status],
  );

  const [state, formAction] = useActionState(updateStatus, initialState);

  return (
    <form action={formAction}>
      <div className="relative">
        <select
          name="status"
          value={selectedStatus}
          onChange={(event) => {
            setSelectedStatus(event.currentTarget.value);
            event.currentTarget.form?.requestSubmit();
          }}
          aria-label="Goal status"
          className="h-11 appearance-none rounded-xl border-[1.5px] border-zinc-200 bg-white py-2 pl-4 pr-10 text-sm font-semibold text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15"
        >
          {GOAL_STATUSES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      </div>
      {state.error && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{state.error}</p>}
    </form>
  );
}
