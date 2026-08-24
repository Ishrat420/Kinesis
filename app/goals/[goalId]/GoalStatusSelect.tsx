"use client";

import { GOAL_STATUSES } from "@/lib/goals/format";

export function GoalStatusSelect({
  status,
  action,
}: {
  status: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <select
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Goal status"
        className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold outline-none"
      >
        {GOAL_STATUSES.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </form>
  );
}
