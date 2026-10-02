"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

/**
 * A small spinner at the end of a sidebar entry while the page it was tapped
 * for is still loading, so the tap visibly registered before the route
 * changes and the entry becomes current. Always in the layout and only faded
 * in, so nothing shifts; Next skips the pending phase entirely for a page
 * already prefetched. Must render inside the entry's <Link>.
 */
export function NavPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <LoaderCircle
      aria-hidden="true"
      className={`ml-auto h-4 w-4 shrink-0 animate-spin transition-opacity ${pending ? "opacity-60" : "opacity-0"}`}
    />
  );
}
