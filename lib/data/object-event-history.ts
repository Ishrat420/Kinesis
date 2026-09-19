import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { describeObjectEvent } from "./object-events";

/**
 * Split from `object-events.ts` deliberately: that file's write helpers take
 * `userId` explicitly and stay free of `@/lib/auth`'s `server-only` import,
 * so plain unit tests can import `lib/data/objects.ts` (which calls
 * `recordItemDeletedEvents`) without a request context. Reading a caller's
 * own history, by contrast, has no explicit `userId` to be given -- it
 * belongs here, self-authenticating like every other `lib/data/*` reader.
 */

/** One History entry, already rendered to a single display line -- see `describeObjectEvent`. */
export type ObjectEventEntry = {
  id: string;
  description: string;
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
  return events.map((event) => ({ id: event.id, description: describeObjectEvent(event), occurredAt: event.occurredAt }));
}
