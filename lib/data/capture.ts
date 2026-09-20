import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { deleteObjects } from "./objects";
import { CAPTURE_SOURCE_PARAM } from "@/lib/capture/targets";

/**
 * Turning a capture into a richer object (KD-008D).
 *
 * A conversion is not a silent create: the module's own create surface opens
 * prefilled, the user fills in whatever that module requires, and only when
 * that record actually exists does the To-Do it came from retire. Abandoning
 * the form therefore loses nothing -- the capture is still there.
 *
 * Module create actions call this with the record they just made. It is one
 * line at each call site, and the conversion rules stay in one place rather
 * than being re-implemented per module.
 */

/**
 * The hidden field a prefilled create form carries back. It shares a name with
 * the query parameter that opened the form, so the value travels URL to field
 * to action without ever being renamed.
 */
export const captureSourceId = (formData: FormData) => {
  const value = formData.get(CAPTURE_SOURCE_PARAM);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/**
 * Retires the To-Do a conversion started at.
 *
 * An unknown or already-deleted source is not an error -- the richer record
 * was still created, and failing the whole action over a missing To-Do
 * would lose the user's work to tidy up a row.
 *
 * The new record's own creation already gets a plain `ITEM_CREATED`
 * `ObjectEvent` (KD-048); the conversion itself -- "this came from a
 * To-Do" -- has no `ObjectEvent` narrative of its own (there is no
 * `ObjectRelationship` between the retiring To-Do and the new record for
 * an event to hang off), a deliberate KD-048 Phase 1 exclusion, revisit
 * only if that provenance is ever asked for in History specifically.
 */
export async function completeCaptureConversion(formData: FormData) {
  const todoId = captureSourceId(formData);
  if (!todoId) return;

  const user = await requireKinesisUser();
  const todo = await prisma.todo.findFirst({ where: { id: todoId, userId: user.id }, select: { objectId: true } });
  if (!todo) return;

  await deleteObjects(prisma, [todo.objectId], user.id);
}
