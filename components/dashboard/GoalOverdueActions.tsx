"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, CalendarClock, X } from "lucide-react";
import { formatDateInput } from "@/lib/dates";
import { GOAL_STATUSES } from "@/lib/goals/format";
import { ICON_ACTION_CLASS } from "./icon-action-styles";

const initialActionState: { error?: string } = {};

/**
 * An overdue goal's two actions (KD-028): move its target date, the same
 * inline CalendarClock affordance ResolveActions offers a milestone or
 * to-do's due date, or change its status outright -- the goal equivalent of
 * resolving it, since a goal has no single "mark complete" the way a
 * milestone or to-do does. Shared by Needs Attention and Upcoming & Due,
 * like ResolveActions, since both show the exact same overdue goal.
 *
 * `getAttentionRecords` only ever surfaces a goal that is still Active, so
 * the status form's own default is always "Active" -- there is no live
 * status value to read back from the row.
 */
export function GoalOverdueActions({ targetDate, updateTargetDate, updateStatus }: {
  targetDate: string;
  updateTargetDate: (previousState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  updateStatus: (previousState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
}) {
  const [editing, setEditing] = useState<"date" | "status" | null>(null);
  const [dateState, dateAction] = useActionState(updateTargetDate, initialActionState);
  const [statusState, statusAction] = useActionState(updateStatus, initialActionState);

  if (editing === "date") {
    return <form action={dateAction} onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <input name="targetDate" type="date" required autoFocus defaultValue={formatDateInput(targetDate)} aria-label="New due date" className="h-9 rounded-lg border border-zinc-200 px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400" />
        <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">Save</button>
        <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      {dateState.error && <p role="alert" className="text-xs font-medium text-red-600">{dateState.error}</p>}
    </form>;
  }

  if (editing === "status") {
    return <form action={statusAction} onClick={(event) => event.stopPropagation()} className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <select name="status" required autoFocus defaultValue="Active" aria-label="New status" className="h-9 rounded-lg border border-zinc-200 px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400">
          {GOAL_STATUSES.map((option) => <option key={option}>{option}</option>)}
        </select>
        <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">Save</button>
        <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      {statusState.error && <p role="alert" className="text-xs font-medium text-red-600">{statusState.error}</p>}
    </form>;
  }

  return <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
    <button type="button" onClick={() => setEditing("date")} aria-label="Edit due date" title="Edit due date" className={`${ICON_ACTION_CLASS} hover:bg-blue-50 hover:text-blue-600`}><CalendarClock className="h-4 w-4" /></button>
    <button type="button" onClick={() => setEditing("status")} aria-label="Change status" title="Change status" className={`${ICON_ACTION_CLASS} hover:bg-violet-50 hover:text-violet-600`}><ArrowRightLeft className="h-4 w-4" /></button>
  </div>;
}
