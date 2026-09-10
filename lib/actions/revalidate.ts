import { revalidatePath } from "next/cache";

/**
 * Revalidates the app shell -- the notification bell, the sidebar, and
 * anything else `app/(app)/layout.tsx` renders -- rather than just the page a
 * mutation happened to run on.
 *
 * `revalidatePath("/")` alone only invalidates the page component; the shared
 * layout above it stays cached. That's how the bell went stale for a custom
 * item's due date while staying fresh for a To-Do's: two modules calling
 * revalidatePath with what looked like the same intent, but weren't. Every
 * mutation that could change what Needs Attention, Upcoming & Due, or the
 * bell shows should call this instead of revalidatePath("/") directly, so
 * getting it right doesn't depend on remembering the second argument.
 */
export function revalidateShell() {
  revalidatePath("/", "layout");
}
