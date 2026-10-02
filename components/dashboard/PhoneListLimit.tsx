"use client";

import { useState } from "react";
import { PHONE_LIST_LIMIT } from "./phone-list-limit";

/**
 * A dashboard list on a phone: the first few rows, then "Show all (n)",
 * instead of a fixed-height box scrolling inside a page that scrolls. The
 * rows themselves are rendered by the server and passed straight through;
 * this only decides whether the ones past the limit show.
 */
export function PhoneListLimit({ total, children }: { total: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="group/limit" data-collapsed={expanded ? undefined : ""}>
      {children}
      {total > PHONE_LIST_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-3 w-full rounded-xl border border-zinc-200/80 py-2.5 text-sm font-medium text-zinc-600 sm:hidden"
        >
          {expanded ? "Show fewer" : `Show all (${total})`}
        </button>
      )}
    </div>
  );
}
