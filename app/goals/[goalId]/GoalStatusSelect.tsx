"use client";

import { GOAL_STATUSES } from "@/lib/goals/format";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function GoalStatusSelect({
  status,
  action,
}: {
  status: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);

  async function updateStatus(formData: FormData) {
    await action(formData);
    router.refresh();
  }

  return (
    <form action={updateStatus}>
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
    </form>
  );
}
