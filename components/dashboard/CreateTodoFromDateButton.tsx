"use client";

import { CirclePlus } from "lucide-react";
import { useState } from "react";
import { AddTodoForm } from "@/app/(app)/todos/AddTodoButton";
import type { ObjectLocation } from "@/lib/objects/locations";
import { formatDateInput } from "@/lib/dates";
import { ICON_ACTION_CLASS } from "./icon-action-styles";

/**
 * The "create a to-do from this" action an Important Date row gets (KD-047),
 * sitting next to its Dismiss button. Opens the same Add-a-to-do dialog the
 * /todos page uses, pre-filled with a suggested title, this date's next
 * occurrence as the due date, and the person it's about already linked --
 * still an ordinary editable form, nothing is created until the user submits
 * it themselves.
 *
 * Hover colour matches teal-600 (`#0d9488`), the colour every other surface
 * already uses for anything To-Do (see lib/objects/locations.ts), so this
 * reads as "this becomes a to-do" at a glance.
 */
export function CreateTodoFromDateButton({
  suggestedTitle,
  dueDate,
  personObjectId,
  linkOptions,
}: {
  suggestedTitle: string;
  dueDate: string;
  personObjectId: string;
  linkOptions: ObjectLocation[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create to-do"
        title="Create to-do"
        className={`${ICON_ACTION_CLASS} hover:bg-teal-50 hover:text-teal-600`}
      >
        <CirclePlus className="h-4 w-4" />
      </button>
      {open && (
        <AddTodoForm
          linkOptions={linkOptions}
          initialName={suggestedTitle}
          initialDueDate={formatDateInput(dueDate)}
          initialLinkObjectIds={[personObjectId]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
