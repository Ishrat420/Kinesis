import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { describeObjectEvent } from "./object-events";
import { locateObject, objectLocationSelect, type ObjectLocation } from "@/lib/objects/locations";

/**
 * Split from `object-events.ts` deliberately: that file's write helpers take
 * `userId` explicitly and stay free of `@/lib/auth`'s `server-only` import,
 * so plain unit tests can import `lib/data/objects.ts` (which calls
 * `recordItemDeletedEvents`) without a request context. Reading a caller's
 * own history, by contrast, has no explicit `userId` to be given -- it
 * belongs here, self-authenticating like every other `lib/data/*` reader.
 */

/** One History entry, already rendered to its title/detail pair -- see `describeObjectEvent`. */
export type ObjectEventEntry = {
  id: string;
  title: string;
  detail: string | null;
  occurredAt: Date;
};

/**
 * An Object's own history, newest first (KD-048 Phase 1) -- unfiltered and
 * unscored for now (no `classifyEventSignificance` yet; Phase 4).
 */
export async function getObjectEvents(objectId: string): Promise<ObjectEventEntry[]> {
  const user = await requireKinesisUser();
  const events = await prisma.objectEvent.findMany({
    where: { objectId, userId: user.id },
    orderBy: { occurredAt: "desc" },
  });
  return events.map((event) => ({ id: event.id, ...describeObjectEvent(event), occurredAt: event.occurredAt }));
}

/** One `getRecentActivity` row -- an `ObjectEvent`'s own title/detail, plus where it happened. */
export type RecentActivityItem = {
  id: string;
  title: string;
  detail: string | null;
  occurredAt: Date;
  objectName: string;
  objectType: ObjectLocation["type"];
  module: string;
  href: string;
  /** Set only for a custom module's own item -- see `ObjectLocation`. */
  icon?: string;
};

/**
 * The account's most recent changes across every object, newest first --
 * the dashboard's "Recent activity" widget (KD-048 Phase 2's first piece).
 * This replaces the old flat `ActivityEvent` log's `Added`/`Updated`/
 * `Completed`/`Converted` vocabulary with the same real per-field facts an
 * object's own History section already shows (`describeObjectEvent`), so
 * "Updated Credit cards under Finance" becomes "Amount changed -- From
 * $10,500.00 to $9,000.00" the same way it would on the item's own page.
 * Unfiltered and unscored, same as `getObjectEvents` -- no significance
 * ranking yet (Phase 4). A row whose object no longer resolves to a live
 * module record (`locateObject` returning null) is skipped rather than
 * shown broken; in practice this is rare, since `ObjectEvent` cascades away
 * with its own object.
 */
export async function getRecentActivity(limit = 8): Promise<RecentActivityItem[]> {
  const user = await requireKinesisUser();
  const events = await prisma.objectEvent.findMany({
    where: { userId: user.id },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { object: { select: objectLocationSelect } },
  });
  return events.flatMap((event) => {
    const location = locateObject(event.object);
    if (!location) return [];
    return [{
      id: event.id, ...describeObjectEvent(event), occurredAt: event.occurredAt,
      objectName: location.name, objectType: location.type, module: location.module,
      href: location.href, icon: location.icon,
    }];
  });
}
