import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

/** "Converted" records a quick capture becoming a richer object (KD-008D). */
export type ActivityAction = "Added" | "Updated" | "Completed" | "Converted";

export type ActivityItem = {
  id: string;
  action: string;
  moduleName: string;
  objectName: string;
  icon: string;
  href: string | null;
  createdAt: Date;
};

/**
 * The dashboard's "Recent activity" widget no longer reads this table --
 * see `getRecentActivity` in `lib/data/object-event-history.ts` (KD-048
 * Phase 2). `addActivity` itself is left in place for now: every call site
 * still writes here, and retiring the writes + the `ActivityEvent` table
 * itself is a separate, larger cleanup (schema migration, ~10 test files)
 * the KD-048 ticket tracks as its own step, not bundled into this change.
 */
export async function addActivity({ action, moduleName, objectName, icon, href }: Omit<ActivityItem, "id" | "createdAt">) {
  const user = await requireKinesisUser();
  return prisma.activityEvent.create({
    data: { id: crypto.randomUUID(), userId: user.id, action, moduleName, objectName, icon, href },
  });
}
