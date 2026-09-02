"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TodoStatus } from "@prisma/client";
import { captureTodo, deleteTodo, getTodoLinkOptions, updateTodoDetails } from "@/lib/data/todos";
import type { ObjectLocation } from "@/lib/objects/locations";
import { addActivity } from "@/lib/data/activity";
import { isTodoStatus } from "@/lib/todos/status";
import { parseDateOnly } from "@/lib/dates";
import { captureCreateHref, DEFAULT_CAPTURE_TARGET, isCaptureTargetType } from "@/lib/capture/targets";

export type CaptureState = { error?: string; captured?: { id: string; name: string } };
export type TodoDetailsState = { error?: string; saved?: boolean };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** Titles are the whole payload of a capture, so an unbounded one is refused rather than truncated. */
const MAX_TITLE_LENGTH = 200;

/**
 * Everything a To-Do change makes stale. A To-Do shows up in the global search
 * index and the dashboard's attention surfaces, both of which the shell renders,
 * so the layout is revalidated rather than the To-Do page alone.
 */
const refresh = () => revalidatePath("/", "layout");

/**
 * Quick capture (KD-008A). A title, and nothing else, becomes a To-Do.
 *
 * This returns the new To-Do instead of redirecting: the point of capture is
 * that the user does not leave what they were doing, so the command bar shows
 * the confirmation in place and offers Undo and Add details from there.
 */
export async function captureTodoAction(rawName: string): Promise<CaptureState> {
  const name = rawName.trim();
  if (!name) return { error: "Type what you need to do." };
  if (name.length > MAX_TITLE_LENGTH) return { error: `Keep it under ${MAX_TITLE_LENGTH} characters — you can add the detail afterwards.` };

  const todo = await captureTodo(name);
  await addActivity({ action: "Added", moduleName: "To-Do", objectName: todo.name, icon: "todos", href: "/todos" });
  refresh();
  return { captured: todo };
}

/**
 * Undo, offered beside the confirmation. It deletes rather than hiding, because
 * an undone capture the user cannot see but Kinesis still holds is worse than
 * no capture at all.
 */
export async function undoCaptureAction(id: string) {
  await deleteTodo(id);
  refresh();
}

/**
 * The "Add details" step (KD-008D).
 *
 * Choosing a different target does not save these details: the capture is on
 * its way to that module's own create surface, which asks for the fields that
 * module actually has. Only the details the target can carry travel with it,
 * which is what stops a due date being entered and then quietly lost.
 */
export async function saveTodoDetailsAction(id: string, _previousState: TodoDetailsState, formData: FormData): Promise<TodoDetailsState> {
  const target = text(formData, "target") || DEFAULT_CAPTURE_TARGET;
  if (!isCaptureTargetType(target)) return { error: "Choose what this should become." };

  const dueDateValue = text(formData, "dueDate");
  if (dueDateValue && !parseDateOnly(dueDateValue)) return { error: "Enter a valid due date." };

  if (target !== DEFAULT_CAPTURE_TARGET) {
    const name = text(formData, "name");
    if (!name) return { error: "This To-Do no longer has a title to carry over." };
    const href = captureCreateHref(target, name, { from: id, dueDate: dueDateValue || undefined });
    if (!href) return { error: "That is not something a capture can become yet." };
    redirect(href);
  }

  const statusValue = text(formData, "status");
  if (statusValue && !isTodoStatus(statusValue)) return { error: "Choose a valid status." };

  await updateTodoDetails(id, {
    status: statusValue ? (statusValue as TodoStatus) : undefined,
    dueDate: dueDateValue ? parseDateOnly(dueDateValue) : null,
    linkObjectId: text(formData, "linkObjectId") || null,
  });
  refresh();
  return { saved: true };
}

/**
 * What a To-Do may be linked to, fetched when the details step opens rather than
 * rendered into every page by the shell. The picker is the only thing that needs
 * this list, and most page views never open it.
 */
export async function captureLinkOptionsAction(): Promise<ObjectLocation[]> {
  return getTodoLinkOptions();
}

export async function setTodoStatusAction(id: string, status: string) {
  if (!isTodoStatus(status)) return;
  const todo = await updateTodoDetails(id, { status });
  if (status === "DONE") await addActivity({ action: "Completed", moduleName: "To-Do", objectName: todo.name, icon: "todos", href: "/todos" });
  refresh();
}

export async function deleteTodoAction(id: string) {
  await deleteTodo(id);
  refresh();
}
