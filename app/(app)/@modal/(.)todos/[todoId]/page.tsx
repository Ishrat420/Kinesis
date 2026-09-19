import { notFound } from "next/navigation";
import { getTodo } from "@/lib/data/todos";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { TodoDetailView } from "@/app/(app)/todos/TodoDetail";

/**
 * The intercepted version of ../../../todos/[todoId]/page.tsx -- clicking a
 * to-do's title on the board lands here instead, rendering the same detail
 * view as a "big window" over the still-mounted board rather than navigating
 * away from it. Reached directly, by refresh, or by a shared link, Next
 * renders the real page in ../../../todos/[todoId]/page.tsx instead; no
 * interception happens there.
 */
export default async function TodoModal({ params }: { params: Promise<{ todoId: string }> }) {
  const { todoId } = await params;
  const todo = await getTodo(todoId);

  if (!todo) notFound();

  const history = await getObjectEvents(todo.objectId);
  return <TodoDetailView todo={todo} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))} asModal />;
}
