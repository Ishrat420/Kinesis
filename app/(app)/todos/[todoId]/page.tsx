import { notFound } from "next/navigation";
import { getTodo } from "@/lib/data/todos";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { getKinesisLinkSection } from "@/lib/data/object-relationships";
import { removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { TodoDetailView } from "../TodoDetail";

export default async function TodoPage({ params }: { params: Promise<{ todoId: string }> }) {
  const { todoId } = await params;
  const todo = await getTodo(todoId);

  // One answer for a missing record across every module -- see app/(app)/not-found.tsx.
  if (!todo) notFound();

  const [history, kinesisLinks] = await Promise.all([getObjectEvents(todo.objectId), getKinesisLinkSection(todo.objectId)]);
  return <TodoDetailView todo={todo} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))}
    kinesisLinks={kinesisLinks}
    updateKinesisLinkAction={updateKinesisLinkAction.bind(null, todo.objectId)}
    removeKinesisLinkAction={removeKinesisLinkAction.bind(null, todo.objectId)}
  />;
}
