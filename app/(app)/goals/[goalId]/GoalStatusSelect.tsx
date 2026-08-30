"use client";

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
      <select
        name="status"
        value={selectedStatus}
        onChange={(event) => {
          setSelectedStatus(event.currentTarget.value);
          event.currentTarget.form?.requestSubmit();
        }}
        aria-label="Goal status"
        className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold outline-none"
      >
        {GOAL_STATUSES.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      {state.error && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{state.error}</p>}
    </form>
  );
}
