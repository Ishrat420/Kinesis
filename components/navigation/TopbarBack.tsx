"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { parentPath } from "@/lib/navigation/back";

/**
 * The ‹ in the top bar on any page below a main section, on phones -- an
 * installed iPhone web app has no browser back button, and not every inner
 * page has a "Back" link of its own. Desktop keeps the browser's.
 *
 * It always goes up to the page's parent, so it's never a dead end, even on a
 * page opened straight from a push notification. When the parent is also the
 * page you just came from, it steps back through history instead, so a list
 * returns at the scroll position and filters you left it with.
 */
export function TopbarBack() {
  const pathname = usePathname();
  const router = useRouter();

  // The previous route, tracked while rendering rather than in an effect, so
  // it's already right on the render that shows the button.
  const [trail, setTrail] = useState<{ current: string; previous: string | null }>({ current: pathname, previous: null });
  if (trail.current !== pathname) setTrail({ current: pathname, previous: trail.current });

  const parent = parentPath(pathname);
  if (!parent) return null;

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (trail.previous === parent ? router.back() : router.push(parent))}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-950 md:hidden"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
