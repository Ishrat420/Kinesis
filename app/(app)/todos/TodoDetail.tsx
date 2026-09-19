"use client";

import { Link2, ListTodo, Pencil, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { Modal } from "@/components/overlay/Modal";
import { ObjectHistory, type ObjectHistoryEntry } from "@/components/history/ObjectHistory";
import { TodoDetailsForm } from "@/components/capture/TodoDetailsForm";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import { formatDate, formatDateInput, formatDeadline } from "@/lib/dates";
import { isOpenTodoStatus, todoStatusDotClass, todoStatusLabel } from "@/lib/todos/status";
import type { TodoRecord } from "@/lib/data/todos";
import { deleteTodoAction } from "./actions";

function InfoTile({ label, value, caption, danger = false }: { label: string; value: React.ReactNode; caption?: string; danger?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${danger ? "border-red-100 bg-red-50/60" : "border-zinc-100 bg-zinc-50/80"}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">{label}</p>
    <p className={`mt-1.5 text-lg font-semibold ${danger ? "text-red-600" : "text-zinc-900"}`}>{value}</p>
    {caption && <p className={`mt-1 text-xs ${danger ? "text-red-500" : "text-zinc-400"}`}>{caption}</p>}
  </div>;
}

/** The read-only status/due-date tiles, linked objects, and notes -- everything the inline edit form doesn't already cover. */
function TodoInfo({ todo, locale, today }: { todo: TodoRecord; locale: string; today: Date }) {
  const open = isOpenTodoStatus(todo.status);
  const overdue = open && todo.dueDate !== null && todo.dueDate < today;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <InfoTile
        label="Status"
        value={<span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${todoStatusDotClass(todo.status)}`} />{todoStatusLabel(todo.status)}</span>}
      />
      {open && todo.dueDate && <InfoTile label="Due" value={formatDate(todo.dueDate, locale)} caption={formatDeadline(todo.dueDate, today)} danger={overdue} />}
      {!open && todo.completedAt && <InfoTile label="Completed" value={formatDate(todo.completedAt, locale)} />}
    </div>
    {todo.links.length > 0 && <div>
      <p className="mb-2 text-xs font-semibold text-zinc-500">Linked to</p>
      <div className="flex flex-wrap gap-2">
        {todo.links.map((link) => <Link key={link.objectId} href={link.href} className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"><Link2 className="h-3 w-3" aria-hidden="true" />{link.name}</Link>)}
      </div>
    </div>}
    {todo.notes && <div><p className="mb-1.5 text-xs font-semibold text-zinc-500">Notes</p><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{todo.notes}</p></div>}
  </div>;
}

/**
 * A To-Do's own detail view (KD-048) -- read-only status/due/links/notes, an
 * inline edit toggle reusing `TodoDetailsForm` (the same fields
 * `CaptureDetailsDialog` shows), and its History section. Rendered two ways
 * from the same component, mirroring Finance's `FinanceItemDetailView`: as
 * the real page at `/todos/[todoId]` (`asModal` false, the default -- reached
 * directly, by refresh, or by a shared link), and as the "big window"
 * intercepted route at `app/(app)/@modal/(.)todos/[todoId]/page.tsx`
 * (`asModal` true -- reached by clicking a to-do's title from the board, so
 * the URL still changes but the board stays mounted underneath).
 *
 * Deleting has no confirmation step here, matching the board's own overflow
 * menu (todos are the one module in this app whose delete never asks first).
 */
export function TodoDetailView({ todo, history, asModal = false }: { todo: TodoRecord; history: ObjectHistoryEntry[]; asModal?: boolean }) {
  const router = useRouter();
  const today = useToday();
  const { locale } = useFormatPreferences();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const close = () => router.back();

  const handleDelete = () => startTransition(async () => {
    setDeleteError(null);
    const result = await deleteTodoAction(todo.id);
    if (result.error) setDeleteError(result.error);
    else router.push("/todos");
  });

  const actions = !editing && (
    <div className="flex gap-2">
      <button type="button" onClick={() => setEditing(true)} className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:-translate-y-0.5"><Pencil className="h-4 w-4" />Edit</button>
      <button type="button" disabled={pending} onClick={handleDelete} className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:-translate-y-0.5 disabled:opacity-50"><Trash2 className="h-4 w-4" />{pending ? "Deleting…" : "Delete"}</button>
    </div>
  );

  const body = editing
    ? <TodoDetailsForm
        todo={todo}
        defaults={{ status: todo.status, dueDate: todo.dueDate ? formatDateInput(todo.dueDate) : "", notes: todo.notes ?? "", linkObjectIds: todo.links.map((link) => link.objectId) }}
        onClose={() => setEditing(false)}
        allowConvert={false}
      />
    : <>
        <TodoInfo todo={todo} locale={locale} today={today} />
        {deleteError && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{deleteError}</p>}
      </>;

  const meta = <>Added {formatDate(todo.createdAt, locale)}</>;

  if (asModal) {
    return (
      <Modal ariaLabel={todo.name} onClose={close} customHeader panelClassName="sm:max-w-2xl relative">
        <button type="button" onClick={close} aria-label="Close dialog" className="absolute right-6 top-6 rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button>
        <div className="flex items-start justify-between gap-4 pr-10">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600"><ListTodo className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">To-Dos</p>
              <h1 className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-zinc-950">{todo.name}</h1>
              <p className="mt-1 text-sm text-zinc-400">{meta}</p>
            </div>
          </div>
        </div>
        <div className="mt-5">{actions}</div>
        <div className="mt-6">{body}</div>
        {!editing && <div className="mt-5"><ObjectHistory entries={history} fallbackCreatedAt={todo.createdAt.toISOString()} locale={locale} /></div>}
      </Modal>
    );
  }

  return <ModuleContent>
    <ModuleHeader
      backHref="/todos"
      backLabel="Back to to-dos"
      breadcrumbs={[{ label: "To-Dos", href: "/todos" }, { label: todo.name }]}
      icon={<ListTodo className="h-5 w-5" />}
      iconClassName="bg-teal-50 text-teal-600"
      title={todo.name}
      description={meta}
      actions={actions}
    />
    <div className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">{body}</div>
    {!editing && <div className="mt-5"><ObjectHistory entries={history} fallbackCreatedAt={todo.createdAt.toISOString()} locale={locale} /></div>}
  </ModuleContent>;
}
