import { prisma } from "./prisma";
import { addActivity } from "./activity";
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
 * Retires the To-Do a conversion started at, and records that it happened.
 *
 * The ActivityEvent is the conversion history: it names both ends and links to
 * the record the To-Do became, so the trail survives the To-Do itself. An
 * unknown or already-deleted source is not an error -- the richer record was
 * still created, and failing the whole action over a missing To-Do would lose
 * the user's work to tidy up a row.
 */
export async function completeCaptureConversion(
  formData: FormData,
  created: { moduleName: string; objectName: string; icon: string; href: string },
) {
  const todoId = captureSourceId(formData);
  if (!todoId) return;

  const user = await requireKinesisUser();
  const todo = await prisma.todo.findFirst({ where: { id: todoId, userId: user.id }, select: { name: true, objectId: true } });
  if (!todo) return;

  await deleteObjects(prisma, [todo.objectId], user.id);
  await addActivity({
    action: "Converted",
    moduleName: created.moduleName,
    objectName: `${todo.name} → ${created.objectName}`,
    icon: created.icon,
    href: created.href,
  });
}
