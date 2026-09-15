"use client";

import { X } from "lucide-react";
import { dismissAttentionItem } from "@/app/actions";
import { ICON_ACTION_CLASS } from "./icon-action-styles";

/**
 * The one Dismiss control shared by Needs Attention and Upcoming & Due --
 * same server action, same icon-only, red-on-hover treatment, so dismissing
 * a row reads as the same act wherever it's clicked from. Icon-only rather
 * than a labelled button on purpose: this sits next to Edit/Reschedule,
 * which already say what they do in words, and a red hover is enough on its
 * own to mark this one as the one that removes the row instead.
 *
 * `onDismissed` is optional so this works either way a caller needs it: with
 * it, for a list (like Needs Attention's modal) that wants the row gone the
 * instant the click lands rather than waiting on the action's own
 * `revalidatePath`; without it, for a plain server-rendered list that is
 * already on the route that revalidate targets, where the automatic
 * post-action refresh does the same job without any client state to manage.
 */
export function DismissButton({ itemKey, onDismissed }: { itemKey: string; onDismissed?: () => void }) {
  return (
    <form action={dismissAttentionItem.bind(null, itemKey)} onSubmit={onDismissed}>
      <button
        type="submit"
        aria-label="Dismiss"
        title="Dismiss"
        className={`${ICON_ACTION_CLASS} hover:bg-red-50 hover:text-red-600`}
      >
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}
